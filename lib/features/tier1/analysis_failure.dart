import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

enum EstimateFailure {
  noFood('no_food',
      'Ravlo couldn’t identify a serving in this photo. Try another photo or enter the food below.'),
  photo('invalid_photo',
      'This photo couldn’t be read. Try another photo or enter the food below.'),
  auth('unauthenticated',
      'Ravlo couldn’t sign in for photo analysis. Try again when connected.'),
  consent('consent_required',
      'Photo analysis needs your permission. Tap Estimate photo to try again.'),
  network('network',
      'Ravlo couldn’t connect. Check your connection and try again.'),
  timeout('timeout',
      'The estimate took too long. You can retry or enter the food below.'),
  service('service',
      'The estimate didn’t come back. You can retry or enter the food below.'),
  result('invalid_response',
      'Ravlo couldn’t read the estimate. You can retry or enter the food below.'),
  save('local_save',
      'Ravlo couldn’t save the change on this phone. Reopen the meal and try again.'),
  refresh('local_refresh',
      'Estimate saved, but could not refresh. Reopen the meal to check saved values.');

  const EstimateFailure(this.code, this.message);
  final String code;
  final String message;
}

bool validEstimateReference(Object? value) =>
    value is String &&
    value.length == 36 &&
    RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
        .hasMatch(value);

class AnalysisFailure implements Exception {
  const AnalysisFailure(this.cause, [this.reference]);
  final EstimateFailure cause;
  final String? reference;

  String get message => [
        cause.message,
        if (reference != null) 'Support reference $reference'
      ].join('\n');
  Map<String, dynamic> get fields => {
        'failureCategory': cause.code,
        if (reference != null) 'reference': reference
      };

  static AnalysisFailure from(Object error) {
    if (error is AnalysisFailure) return error;
    if (error is FirebaseAuthException) {
      return AnalysisFailure(error.code == 'network-request-failed'
          ? EstimateFailure.network
          : EstimateFailure.auth);
    }
    if (error is FirebaseFunctionsException) {
      final details = error.details;
      final rawReference = details is Map ? details['reference'] : null;
      final cause = switch (error.code) {
        'failed-precondition'
            when details is Map && details['failureCategory'] == 'no_food' =>
          EstimateFailure.noFood,
        'invalid-argument' => EstimateFailure.photo,
        'unauthenticated' => EstimateFailure.auth,
        'permission-denied'
            when details is Map &&
                details['failureCategory'] == 'consent_required' =>
          EstimateFailure.consent,
        'deadline-exceeded' => EstimateFailure.timeout,
        _ => EstimateFailure.service,
      };
      return AnalysisFailure(cause,
          validEstimateReference(rawReference) ? rawReference as String : null);
    }
    return const AnalysisFailure(EstimateFailure.service);
  }
}

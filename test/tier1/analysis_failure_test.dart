import 'package:calorix/features/tier1/analysis_failure.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('legacy no-food errors remain actionable without a reference', () {
    final failure = AnalysisFailure.from(FirebaseFunctionsException(
      message: 'private error',
      code: 'failed-precondition',
      details: const {'failureCategory': 'no_food'},
    ));
    expect(failure.cause, EstimateFailure.noFood);
    expect(failure.fields, {'failureCategory': 'no_food'});
  });

  test('unexpected error details never enter the UI or the local journal', () {
    final failure = AnalysisFailure.from(FirebaseFunctionsException(
      message: 'private provider text',
      code: 'unavailable',
      details: const {
        'reference': 'private contents',
        'failureCategory': 'private uid'
      },
    ));
    expect(failure.message, isNot(contains('private')));
    expect(failure.fields, {'failureCategory': 'service'});
    expect(AnalysisFailure.from(StateError('private error')).fields,
        failure.fields);
  });
}

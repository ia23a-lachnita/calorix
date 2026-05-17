import 'package:google_generative_ai/google_generative_ai.dart';

class GeminiService {
  GeminiService(this._apiKey);
  final String _apiKey;

  late final GenerativeModel _chatModel = GenerativeModel(
    model: 'gemini-2.5-pro',
    apiKey: _apiKey,
  );

  late final ChatSession _session = _chatModel.startChat();

  Future<String> sendMessage(String message, {String? context}) async {
    final prompt = context != null ? '$context\n\n$message' : message;
    final response = await _session.sendMessage(Content.text(prompt));
    return response.text ?? '';
  }

  Future<String> adjustTDEE({
    required double weight,
    required String activityLevel,
    required int trainingFrequency,
  }) async {
    final model = GenerativeModel(model: 'gemini-2.5-flash', apiKey: _apiKey);
    final prompt = '''
Compute TDEE for:
- Weight: ${weight}kg
- Activity: $activityLevel
- Training: $trainingFrequency days/week

Return JSON only: {"tdee": number, "bmr": number, "suggestedKcal": number, "reasoning": string}
''';
    final response = await model.generateContent([Content.text(prompt)]);
    return response.text ?? '{}';
  }
}

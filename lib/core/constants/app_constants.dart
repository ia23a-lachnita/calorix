abstract final class AppConstants {
  // Sample data
  static const int defaultKcalTarget = 2400;
  static const int defaultProteinTarget = 170;
  static const int defaultCarbsTarget = 250;
  static const int defaultFatTarget = 70;

  // Serving multiplier
  static const double servingMultiplierMin = 0.25;
  static const double servingMultiplierMax = 5.0;
  static const double servingMultiplierStep = 0.25;

  // Confidence threshold
  static const double confidenceThreshold = 0.80;

  // Animation durations (ms)
  static const int countUpDuration = 1400;
  static const int macroBarDuration = 1200;
  static const int scanShimmerDuration = 1600;
  static const int skeletonShimmerDuration = 1400;
  static const int reticleSnapDuration = 200;
  static const int sheetSlideDuration = 320;
  static const int confidencePulseDuration = 1000;

  // Goals kcal range
  static const int kcalSliderMin = 1500;
  static const int kcalSliderMax = 3500;

  // Storage
  static const String fcmPermissionKey = 'fcmPermissionGranted';
  static const String themeModeKey = 'themeMode';

  // Firestore
  static const String entriesCollection = 'entries';
  static const String usersCollection = 'users';
  static const String dailyLogsCollection = 'dailyLogs';
  static const String targetsSubCollection = 'targets';
  static const String weightLogsSubCollection = 'weightLogs';
}

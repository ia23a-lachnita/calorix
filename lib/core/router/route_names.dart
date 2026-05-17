abstract final class RouteNames {
  static const String scan = 'scan';
  static const String processing = 'processing';
  static const String today = 'today';
  static const String foodDetail = 'foodDetail';
  static const String history = 'history';
  static const String historyDay = 'historyDay';
  static const String goals = 'goals';
  static const String aiChat = 'aiChat';
  static const String profile = 'profile';
}

abstract final class RoutePaths {
  static const String scan = '/scan';
  static const String processing = '/processing/:id';
  static const String today = '/today';
  static const String foodDetail = '/food/:id';
  static const String history = '/history';
  static const String historyDay = '/history/:date';
  static const String goals = '/goals';
  static const String aiChat = '/ai';
  static const String profile = '/profile';
}

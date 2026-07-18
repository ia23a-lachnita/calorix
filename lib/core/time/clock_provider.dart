import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'clock.dart';
import 'timezone_init.dart';

final clockProvider = Provider<Clock>((_) {
  initializeTimezoneDatabase();
  return RealClock();
});

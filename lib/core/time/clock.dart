import 'package:timezone/timezone.dart' as tz;

abstract class Clock {
  tz.TZDateTime nowTZ();
  DateTime now();
}

class RealClock implements Clock {
  @override
  tz.TZDateTime nowTZ() => tz.TZDateTime.now(tz.local);
  @override
  DateTime now() => DateTime.now();
}

class FakeClock implements Clock {
  FakeClock(this._fake);
  tz.TZDateTime _fake;
  @override
  tz.TZDateTime nowTZ() => _fake;
  @override
  DateTime now() => _fake;
  void advance(Duration d) => _fake = _fake.add(d);
  void setTo(tz.TZDateTime d) => _fake = d;
}

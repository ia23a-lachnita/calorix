import 'dart:convert';
import 'dart:io';
import '../../core/constants/app_constants.dart';

/// The user's daily targets. The Today ring is drawn against these.
class Tier1Targets {
  const Tier1Targets(
      {required this.kcal,
      required this.proteinG,
      required this.carbsG,
      required this.fatG});
  final int kcal, proteinG, carbsG, fatG;

  static const defaults = Tier1Targets(
      kcal: AppConstants.defaultKcalTarget,
      proteinG: AppConstants.defaultProteinTarget,
      carbsG: AppConstants.defaultCarbsTarget,
      fatG: AppConstants.defaultFatTarget);

  /// Accepts only whole positive numbers in a sane range; anything else is a
  /// damaged file and falls back to the defaults.
  static bool valid(int kcal, int proteinG, int carbsG, int fatG) =>
      kcal >= 500 &&
      kcal <= 10000 &&
      [proteinG, carbsG, fatG].every((g) => g >= 1 && g <= 2000);

  Map<String, dynamic> toJson() =>
      {'kcal': kcal, 'proteinG': proteinG, 'carbsG': carbsG, 'fatG': fatG};

  static Tier1Targets fromJson(Object? json) {
    if (json is! Map) return defaults;
    final values = [
      for (final key in ['kcal', 'proteinG', 'carbsG', 'fatG']) json[key]
    ];
    if (values.any((v) => v is! int)) return defaults;
    final v = values.cast<int>();
    return valid(v[0], v[1], v[2], v[3])
        ? Tier1Targets(kcal: v[0], proteinG: v[1], carbsG: v[2], fatG: v[3])
        : defaults;
  }
}

/// Keeps the targets in one small file. Without a file (widget tests with an
/// injected meal store) they live in memory only.
class Tier1TargetStore {
  Tier1TargetStore([this.file]);
  final File? file;
  Tier1Targets _memory = Tier1Targets.defaults;

  Future<Tier1Targets> load() async {
    final f = file;
    if (f == null || !await f.exists()) return _memory;
    try {
      return _memory =
          Tier1Targets.fromJson(jsonDecode(await f.readAsString()));
    } catch (_) {
      return _memory = Tier1Targets.defaults;
    }
  }

  Future<void> save(Tier1Targets targets) async {
    _memory = targets;
    final f = file;
    if (f == null) return;
    await f.parent.create(recursive: true);
    final temp = File('${f.path}.tmp');
    await temp.writeAsString(jsonEncode(targets.toJson()), flush: true);
    await temp.rename(f.path);
  }
}

import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:yaml/yaml.dart';

void main() {
  test('Functions verification fetches pinned historical comparator source',
      () {
    final workflow =
        loadYaml(File('.github/workflows/verify.yml').readAsStringSync())
            as YamlMap;
    final steps = workflow['jobs']['functions']['steps'] as YamlList;
    final checkout = steps
        .cast<YamlMap>()
        .singleWhere((step) => step['uses'] == 'actions/checkout@v4');
    expect(checkout['with']?['fetch-depth'], 0,
        reason:
            'Frozen replay requires the older engine commit in Git history');
  });
}

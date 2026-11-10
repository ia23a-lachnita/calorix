import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/manual_nutrient_catalog.dart';
import 'support/portion_fixtures.dart';

Tier1Meal food(Tier1Meal meal,int index,String? id)=>(meal as dynamic).correctFood(index,id,at:portionDate) as Tier1Meal;
Map<dynamic,dynamic> overrides(Tier1Meal meal)=>(meal as dynamic).foodOverrides as Map;
void main(){
  test('frozen manual catalog contains exact records and immutable nutrient data',(){
    final source=jsonDecode(File('functions/eval/tier1-public/catalog-v2.json').readAsStringSync()) as Map;
    expect(manualFoods.length,73);expect(manualFoodCatalogVersion,source['version']);
    for(final raw in source['records'] as List){
      final record=manualFood(raw['id'] as String)!;
      expect(record.description,raw['description']);expect(record.preparation,raw['preparation']);
      expect(record.per100,raw['per100']);expect(record.sourceUrl,raw['sourceUrl']);
      expect(record.sourceArchiveSha256,raw['sourceArchiveSha256']);expect(record.sourceRowSha256,raw['sourceRowSha256']);
    }
    expect(()=>manualFoods.clear(),throwsUnsupportedError);
    expect(()=>manualFood('usda:168878')!.per100['kcal']=1,throwsUnsupportedError);
    expect(manualFood('not-a-record'),isNull);
  });
  test('local search normalizes case punctuation diacritics and all tokens',(){
    expect(searchManualFoods('RICE, WHITE cooked').map((r)=>r.id),contains('usda:168878'));
    expect(searchManualFoods('ríce white').map((r)=>r.id),contains('usda:168878'));
    expect(searchManualFoods('white nonexistentword'),isEmpty);
    expect(searchManualFoods('  ').length,73);
  });
  test('food replacement preserves grams and original analysis and uses explicit per100',(){
    final original=portionMeal().confirmConsumption(.5);final bytes=jsonEncode(original.toJson());
    final changed=food(original,1,'usda:168878');
    expect(changed.served!.kcal,closeTo(80+55*1.3+17.5,1e-9));
    expect(changed.componentMassG(1),55);expect(changed.analysis,original.analysis);
    expect(changed.consumedFraction,isNull);expect(changed.source,'food_correction');
    expect(changed.toJson()['foodOverrides'],{'1':'usda:168878'});
    expect(changed.toJson()['foodOverridesCatalogVersion'],manualFoodCatalogVersion);
    expect(changed.toJson()['schemaVersion'],2);expect(jsonEncode(original.toJson()),bytes);
    expect(changed.adjustmentHistory.last['kind'],'food');
  });
  test('food and portion edits commute and never substitute serving priors',(){
    final initial=portionMeal();
    final a=food(initial.correctPortion(1,86,at:portionDate),1,'usda:168878');
    final b=food(initial,1,'usda:168878').correctPortion(1,86,at:portionDate);
    expect(a.served!.toJson(),b.served!.toJson());expect(a.componentMassG(1),86);
    expect(a.served!.kcal,closeTo(97.5+86*1.3,1e-9));
    final c=a.correctPortion(0,80,at:portionDate);expect(c.served!.kcal,closeTo(40+86*1.3+17.5,1e-9));
    expect(food(c,1,'usda:169704').componentMassG(1),86);
  });
  test('restoring predicted food preserves other overrides and exact original baseline',(){
    final initial=portionMeal();final changed=food(food(initial,1,'usda:168878'),0,'usda:169704');
    final one=food(changed,1,null);expect(overrides(one),{0:'usda:169704'});
    final restored=food(one,0,null);expect(restored.served!.toJson(),initial.served!.toJson());
    expect(overrides(restored),isEmpty);expect(restored.toJson()['schemaVersion'],1);
    expect(restored.toJson().containsKey('foodOverridesCatalogVersion'),isFalse);
  });
  test('same selection and restore-without-override are identity noops including intake',(){
    final initial=portionMeal().confirmConsumption(1);expect(identical(food(initial,1,null),initial),isTrue);
    final changed=food(initial,1,'usda:168878').confirmConsumption(1);
    expect(identical(food(changed,1,'usda:168878'),changed),isTrue);
    expect(changed.consumedFraction,1);
  });
  test('selecting the original database record normalizes to baseline restoration',(){
    final initial=portionMeal(question:true).answerPreparation('oil_10g');
    expect(identical(food(initial,3,'usda:171413'),initial),isTrue);
    final changed=food(initial,3,'usda:168878');final restored=food(changed,3,'usda:171413');
    expect(overrides(restored),isEmpty);expect(restored.served!.toJson(),initial.served!.toJson());
  });
  test('extra preparation oil remains separate and can be excluded explicitly',(){
    final changed=food(portionMeal(question:true),1,'usda:168878').answerPreparation('oil_10g');
    expect((changed.analysis!['components'] as List).length,4);
    expect(changed.served!.kcal,closeTo(169+88.4,1e-9));expect(overrides(changed),{1:'usda:168878'});
    final excluded=changed.correctPortion(3,0,at:portionDate);
    expect(excluded.served!.kcal,closeTo(169,1e-9));expect(excluded.hasPendingPreparationQuestion,isFalse);
    expect((excluded.analysis!['components'] as List).last['name'],'Additional oil');
  });
  test('manual aggregate remains explicit and a changed food recalculates it',(){
    final changed=food(portionMeal(),1,'usda:168878');
    final manual=changed.edit(changed.name,Tier1Nutrients(kcal:900));
    expect(overrides(manual),{1:'usda:168878'});expect(manual.hasManualNutritionOverride,isTrue);
    final next=food(manual,1,'usda:169704');expect(next.hasManualNutritionOverride,isFalse);
    expect(next.served!.kcal,isNot(900));
  });
  test('new analysis archives and clears food state; repeat remains an unweighed estimate',(){
    final changed=food(portionMeal(),1,'usda:168878');
    final next=changed.withAnalysis(portionAnalysis(),at:portionDate);
    expect(overrides(next),isEmpty);expect(next.adjustmentHistory.last['previous']['foodOverrides'],{'1':'usda:168878'});
    final repeat=changed.repeat('repeat',portionDate,2);
    expect(repeat.served!.kcal,changed.served!.kcal*2);expect(repeat.metadata['referenceIsWeighed'],false);
    expect(overrides(repeat),isEmpty);
  });
  test('unknown remaining nutrients stay unknown; replacing their component permits known sum',(){
    final initial=portionMeal(unknownFat:true);
    expect(food(initial,0,'usda:168878').served!.fatG,isNull);
    expect(food(initial,1,'usda:168878').served!.fatG,closeTo(.32+.55*.28+.21,1e-9));
    expect(food(food(initial,1,'usda:168878'),1,null).served!.fatG,isNull);
  });
  test('invalid selection index or record cannot mutate original',(){
    final initial=portionMeal();final bytes=jsonEncode(initial.toJson());
    for(final index in [-1,3]){expect(()=>food(initial,index,'usda:168878'),throwsArgumentError);}
    expect(()=>food(initial,1,'missing'),throwsArgumentError);expect(jsonEncode(initial.toJson()),bytes);
  });
  test('strict versioned local data rejects unknown IDs version and indices',(){
    final good=food(portionMeal(),1,'usda:168878').toJson();
    expect(Tier1Meal.fromJson(good).served!.kcal,169);
    for(final patch in [
      {'foodOverridesCatalogVersion':'unknown'}, {'foodOverrides':{'1':'missing'}},
      {'foodOverrides':{'3':'usda:168878'}}, {'schemaVersion':1},
      {'foodOverrides':{}}, {'foodOverrides':{'01':'usda:168878'}},
    ]){expect(()=>Tier1Meal.fromJson({...good,...patch}),throwsFormatException);}
    expect(Tier1Meal.fromJson(portionMeal().toJson()).toJson(),portionMeal().toJson());
  });
  test('portion coherence includes food overrides and saved maps are immutable',(){
    final changed=food(portionMeal(),1,'usda:168878').correctPortion(1,86,at:portionDate);
    expect(Tier1Meal.fromJson(changed.toJson()).served!.toJson(),changed.served!.toJson());
    final broken=changed.toJson();broken['served']={'kcal':900.0};
    expect(()=>Tier1Meal.fromJson(broken),throwsA(anyOf(isA<ArgumentError>(),isA<FormatException>())));
    expect(()=>overrides(changed).clear(),throwsUnsupportedError);
  });
  test('store preserves corrupt catalog bytes and refuses overwrite',()async{
    final root=await Directory.systemTemp.createTemp('food-corruption-');addTearDown(()=>root.delete(recursive:true));
    final data=portionMeal().toJson()..addAll({'schemaVersion':2,'foodOverrides':{'1':'unknown'},'foodOverridesCatalogVersion':manualFoodCatalogVersion});
    final bytes=jsonEncode([data]);final file=File('${root.path}/meals.json');await file.writeAsString(bytes);
    final store=Tier1MealStore(root);await expectLater(store.load(),throwsFormatException);
    await expectLater(store.save(portionMeal()),throwsFormatException);expect(await file.readAsString(),bytes);
  });
}

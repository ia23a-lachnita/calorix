import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'support/portion_fixtures.dart';

// Dynamic invocation makes absent behavior a runtime RED before implementation.
Tier1Meal correct(Tier1Meal meal,int index,double grams)=>
  (meal as dynamic).correctPortion(index,grams,at:portionDate) as Tier1Meal;
List<Map<String,dynamic>> events(Tier1Meal meal)=>
  (meal.toJson()['adjustmentHistory'] as List? ?? []).map((e)=>Map<String,dynamic>.from(e as Map)).toList();

void main() {
  test('changes one component from original nutrient basis and preserves original analysis',(){
    final initial=portionMeal().confirmConsumption(.5);final before=jsonEncode(initial.toJson());
    final changed=correct(initial,1,86);
    expect(changed.served!.kcal,closeTo(613.5,1e-9));
    expect(changed.served!.proteinG,closeTo(19.08,1e-9));
    expect(changed.served!.carbsG,closeTo(34.5,1e-9));
    expect(changed.served!.fatG,closeTo(43.53,1e-9));
    expect(changed.analysis,initial.analysis);expect(changed.metadata,initial.metadata);
    expect(changed.consumedFraction,isNull);expect(changed.source,'portion_correction');
    expect(changed.toJson()['portionOverrides'],{'1':86.0});
    expect(events(changed).single['kind'],'portion');
    expect(events(changed).single['at'],portionDate.toIso8601String());
    expect((events(changed).single['previous'] as Map).containsKey('adjustmentHistory'),isFalse);
    expect(jsonEncode(initial.toJson()),before);
  });
  test('multiple edits recompute rather than compound; individual restores preserve other edits',(){
    final original=portionMeal();
    final twice=correct(correct(original,1,86),1,100);
    expect(twice.served!.kcal,closeTo(697.5,1e-9));
    final other=correct(twice,0,80);expect(other.served!.kcal,closeTo(657.5,1e-9));
    final restoredAlmond=correct(other,1,55);
    expect(restoredAlmond.served!.kcal,closeTo(387.5,1e-9));
    expect(restoredAlmond.toJson()['portionOverrides'],{'0':80.0});
    final restoredAll=correct(restoredAlmond,0,160);
    expect(restoredAll.served!.toJson(),original.served!.toJson());
    expect(restoredAll.toJson().containsKey('portionOverrides'),isFalse);
  });
  test('unchanged grams are exact no-op including intake, precision and history',(){
    final original=portionMeal().confirmConsumption(1);
    final same=correct(original,1,55);
    expect(identical(same,original),isTrue);expect(same.consumedKcal,original.served!.kcal);
    expect(events(same),isEmpty);expect(same.source,'A1');
  });
  test('zero grams excludes an item without deleting its source; unknown macros stay unknown',(){
    final original=portionMeal(unknownFat:true);
    final changed=correct(original,1,86);expect(changed.served!.fatG,isNull);
    final removed=correct(changed,1,0);expect(removed.served!.kcal,closeTo(97.5,1e-9));
    expect(removed.served!.fatG,isNull);expect(removed.analysis,original.analysis);
    expect((removed.analysis!['components'] as List).length,3);
  });
  test('invalid grams and indices fail without mutating the original',(){
    final original=portionMeal();final before=jsonEncode(original.toJson());
    for(final grams in [-1.0,double.nan,double.infinity,100001.0]){
      expect(()=>correct(original,1,grams),throwsArgumentError);
    }
    for(final index in [-1,3]){expect(()=>correct(original,index,1),throwsArgumentError);}
    expect(jsonEncode(original.toJson()),before);
  });
  test('inconsistent component basis is not silently recalculated',(){
    final analysis=portionAnalysis();(analysis['totals'] as Map)['kcal']=900.0;
    final broken=Tier1Meal(id:'broken',capturedAt:portionDate,name:'Broken',analysis:analysis,served:Tier1Nutrients(kcal:900),source:'A1');
    expect((broken as dynamic).canCorrectPortions,isFalse);
    expect(()=>correct(broken,1,86),throwsStateError);
  });
  test('rename preserves overrides/intake; manual total edits archive and clear active overrides',(){
    final changed=correct(portionMeal(),1,86).confirmConsumption(1);
    final renamed=(changed as dynamic).edit('Renamed',changed.served!,at:portionDate) as Tier1Meal;
    expect(renamed.toJson()['portionOverrides'],{'1':86.0});expect(renamed.consumedFraction,1);
    final manual=(renamed as dynamic).edit('Renamed',Tier1Nutrients(kcal:900),at:portionDate) as Tier1Meal;
    expect(manual.toJson().containsKey('portionOverrides'),isFalse);
    expect(manual.served!.kcal,900);expect(manual.consumedFraction,isNull);
    expect((manual as dynamic).hasManualNutritionOverride,isTrue);
    final recalculated=correct(manual,1,90);expect(recalculated.served!.kcal,closeTo(637.5,1e-9));
    expect(events(manual).last['kind'],'manual_totals');
    expect((events(manual).last['previous'] as Map)['portionOverrides'],{'1':86.0});
  });
  test('new inference archives previous corrected estimate and resets active overrides',(){
    final changed=correct(portionMeal(),1,86);
    final fresh=portionAnalysis();fresh['mealName']='New estimate';
    final next=(changed as dynamic).withAnalysis(fresh,at:portionDate) as Tier1Meal;
    expect(next.source,'A1');expect(next.name,'New estimate');
    expect(next.toJson().containsKey('portionOverrides'),isFalse);
    expect(next.served!.kcal,portionMeal().served!.kcal);
    final previous=events(next).last['previous'] as Map;
    expect(previous['analysis'],changed.analysis);expect(previous['portionOverrides'],{'1':86.0});
    expect((previous['served'] as Map)['kcal'],closeTo(613.5,1e-9));
    expect(events(next).last['kind'],'new_estimate');
  });
  test('one preparation answer retains corrected portions and user name',(){
    final changed=correct(portionMeal(question:true),1,86);
    final named=(changed as dynamic).edit('My breakfast',changed.served!,at:portionDate) as Tier1Meal;
    final answered=(named as dynamic).answerPreparation('oil_10g',at:portionDate) as Tier1Meal;
    expect(answered.name,'My breakfast');expect(answered.served!.kcal,closeTo(701.9,1e-9));
    expect(answered.toJson()['portionOverrides'],{'1':86.0});
    expect((answered.analysis!['components'] as List).length,4);
    expect((answered.analysis!['question'] as Map)['answered'],isTrue);
    expect(()=>answered.answerPreparation('oil_10g'),throwsStateError);
    final manual=(changed as dynamic).edit(changed.name,Tier1Nutrients(kcal:900),at:portionDate) as Tier1Meal;
    expect(()=>manual.answerPreparation('oil_10g'),throwsStateError);
  });
  test('corrected repeats use corrected totals while leaving intake unconfirmed',(){
    final changed=correct(portionMeal().confirmConsumption(1),1,86);
    final repeated=changed.repeat('repeat',portionDate,1.5);
    expect(repeated.served!.kcal,closeTo(920.25,1e-9));expect(repeated.consumedFraction,isNull);
    expect(repeated.repeatOf,changed.id);expect(repeated.metadata['referenceIsWeighed'],isFalse);
  });
  test('roundtrip/store retain snapshots and overrides; deletion clears backup',() async {
    final changed=correct(portionMeal(),1,86);
    final roundtrip=Tier1Meal.fromJson(Map<String,dynamic>.from(jsonDecode(jsonEncode(changed.toJson())) as Map));
    expect(roundtrip.toJson(),changed.toJson());
    final root=await Directory.systemTemp.createTemp('tier1-portions-');addTearDown(()=>root.delete(recursive:true));
    final store=Tier1MealStore(root);await store.save(changed);
    final loaded=(await store.load()).single;
    expect(loaded.toJson()['portionOverrides'],{'1':86.0});expect(events(loaded),events(changed));
    await store.delete(changed.id);expect(await store.load(),isEmpty);
    expect(await File('${root.path}/meals.previous.json').exists(),isFalse);
  });
}

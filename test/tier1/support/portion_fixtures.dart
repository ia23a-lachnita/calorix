import 'package:calorix/features/tier1/local_meal.dart';

final portionDate=DateTime.utc(2026,11,8,12);
// Synthetic arithmetic fixtures only; these are not measured meals.
Map<String,dynamic> portionAnalysis({bool unknownFat=false,bool question=false}) {
  Map<String,dynamic> component(String name,double mass,Map<String,dynamic> nutrients)=>{
    'name':name,'massG':mass,'preparation':'fixture','assumptions':<String>[],
    'nutrients':nutrients,'source':{'kind':'unverified_vlm_estimate','recordId':null},
  };
  return {'schemaVersion':1,'mealName':'Portion meal',
    'totals':{'kcal':427.50000000000006,'proteinG':12.88,'carbsG':31.4,'fatG':unknownFat?null:28.03},
    'components':[
      component('Apple',160,{'kcal':80.0,'proteinG':.48,'carbsG':22.4,'fatG':.32}),
      component('Almonds',55,{'kcal':330.0,'proteinG':11.0,'carbsG':5.5,'fatG':unknownFat?null:27.5}),
      component('Cauliflower',70,{'kcal':17.5,'proteinG':1.4,'carbsG':3.5,'fatG':.21}),
    ],'ambiguities':<String>[],
    'question':question?{'id':'added-fat','text':'Was there extra oil?','answered':false,'answer':null,'options':[
      {'id':'oil_10g','label':'About 2 tsp oil (10 g)',
       'add':{'kcal':88.4,'proteinG':0.0,'carbsG':0.0,'fatG':10.0},
       'component':{'name':'Additional oil','massG':10.0,'preparation':'oil','assumptions':<String>[],
         'nutrients':{'kcal':88.4,'proteinG':0.0,'carbsG':0.0,'fatG':10.0},
         'source':{'kind':'database_match','recordId':'usda:171413'}}}
    ]}:null,
    'provenance':{'model':'fixture-only','promptSha256':'fixture-original','catalogVersion':'fixture'},
    'rawInventory':{'fixture':true,'original':true},
  };
}
Tier1Meal portionMeal({bool unknownFat=false,bool question=false,bool photo=false}) {
  final analysis=portionAnalysis(unknownFat:unknownFat,question:question);
  return Tier1Meal(id:'portion',capturedAt:portionDate,name:'Portion meal',
    served:Tier1Nutrients.fromJson(Map<String,dynamic>.from(analysis['totals'] as Map)),
    analysis:analysis,photoPath:photo?'/portion-widget-missing-photo.jpg':null,
    metadata:{'fixture':true,'referenceIsWeighed':false},source:'A1');
}

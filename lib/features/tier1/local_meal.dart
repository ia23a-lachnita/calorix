/// Local Tier1 records separate approximate served food from confirmed intake.
class Tier1Nutrients {
  Tier1Nutrients({required this.kcal, this.proteinG, this.carbsG, this.fatG}) {
    for (final value in [kcal, proteinG, carbsG, fatG]) {
      if (value != null && (!value.isFinite || value < 0 || value > 1000000)) {
        throw ArgumentError('Nutrition must be finite and nonnegative');
      }
    }
  }
  final double kcal;
  final double? proteinG, carbsG, fatG;
  factory Tier1Nutrients.fromJson(Map<String, dynamic> json) => Tier1Nutrients(
    kcal: (json['kcal'] as num).toDouble(),
    proteinG: (json['proteinG'] as num?)?.toDouble(),
    carbsG: (json['carbsG'] as num?)?.toDouble(),
    fatG: (json['fatG'] as num?)?.toDouble(),
  );
  Map<String, dynamic> toJson() => {'kcal':kcal,'proteinG':proteinG,'carbsG':carbsG,'fatG':fatG};
  Tier1Nutrients scaled(double factor) => Tier1Nutrients(kcal:kcal*factor,
    proteinG:proteinG == null ? null : proteinG!*factor,
    carbsG:carbsG == null ? null : carbsG!*factor,
    fatG:fatG == null ? null : fatG!*factor);
}

class Tier1Meal {
  Tier1Meal({required this.id, required this.capturedAt, required this.name,
    this.served, this.photoPath, this.metadata = const {}, this.analysis,
    this.consumedFraction, this.cloudConsent = false, this.source = 'manual',
    this.revision = 0, this.repeatOf}) {
    if (!RegExp(r'^[a-zA-Z0-9_-]{1,80}$').hasMatch(id) || name.trim().isEmpty ||
        name.length > 160 || revision < 0) throw ArgumentError('Invalid meal record');
    if (consumedFraction != null && (!consumedFraction!.isFinite || consumedFraction! < 0 || consumedFraction! > 1 || served == null)) {
      throw ArgumentError('Invalid confirmed consumption');
    }
  }
  final String id, name, source;
  final DateTime capturedAt;
  final Tier1Nutrients? served;
  final String? photoPath, repeatOf;
  final Map<String, dynamic> metadata;
  final Map<String, dynamic>? analysis;
  final double? consumedFraction;
  final bool cloudConsent;
  final int revision;
  double? get consumedKcal => consumedFraction == null ? null : served!.kcal*consumedFraction!;
  String get consumptionSource => consumedFraction == null ? 'served_only' : 'confirmed_fraction';

  Tier1Meal _copy({String? name,Tier1Nutrients? served,bool? cloudConsent,
    int? revision,Map<String,dynamic>? analysis,String? source,
    double? fraction,bool resetConsumption=false}) => Tier1Meal(id:id,
    capturedAt:capturedAt,name:name??this.name,served:served??this.served,
    photoPath:photoPath,metadata:metadata,analysis:analysis??this.analysis,
    cloudConsent:cloudConsent??this.cloudConsent,source:source??this.source,
    revision:revision??this.revision,repeatOf:repeatOf,
    consumedFraction:resetConsumption?null:fraction??consumedFraction);
  Tier1Meal withRevision(int value) => _copy(revision:value);
  Tier1Meal withConsent() => _copy(cloudConsent:true);
  Tier1Meal confirmConsumption(double fraction) => _copy(fraction:fraction);
  Tier1Meal clearConsumption() => _copy(resetConsumption:true);
  Tier1Meal edit(String name,Tier1Nutrients nutrients) {
    final sameNutrition=served!=null && served!.kcal==nutrients.kcal &&
      served!.proteinG==nutrients.proteinG && served!.carbsG==nutrients.carbsG && served!.fatG==nutrients.fatG;
    if(name.trim()==this.name && sameNutrition)return this;
    return _copy(name:name.trim(),served:nutrients,source:'manual_correction',resetConsumption:!sameNutrition);
  }
  Tier1Meal answerPreparation(String answer) {
    if(source!='A1' || analysis==null)throw StateError('No active preparation question');
    final value=Map<String,dynamic>.from(analysis!);
    final rawQuestion=value['question'];
    if(rawQuestion is! Map || rawQuestion['answered']==true)throw StateError('No unanswered question');
    final question=Map<String,dynamic>.from(rawQuestion);
    final options=(question['options'] as List).map((o)=>Map<String,dynamic>.from(o as Map));
    final option=options.where((o)=>o['id']==answer).firstOrNull;
    if(option==null)throw ArgumentError('Unsupported preparation answer');
    final components=List<dynamic>.from(value['components'] as List);
    if(option['component']!=null)components.add(Map<String,dynamic>.from(option['component'] as Map));
    final totals=<String,double>{'kcal':0,'proteinG':0,'carbsG':0,'fatG':0};
    for(final component in components){
      final nutrients=Map<String,dynamic>.from((component as Map)['nutrients'] as Map);
      for(final key in totals.keys){totals[key]=totals[key]!+(nutrients[key] as num).toDouble();}
    }
    value['components']=components;value['totals']=totals;
    value['question']={...question,'answered':true,'answer':answer};
    value['userPreparationAnswer']=option['label'];
    return withAnalysis(value);
  }
  Tier1Meal withAnalysis(Map<String,dynamic> value) => _copy(
    name:value['mealName'] as String,served:Tier1Nutrients.fromJson(Map<String,dynamic>.from(value['totals'] as Map)),
    analysis:value,source:'A1',resetConsumption:true);
  Tier1Meal repeat(String newId,DateTime at,double multiplier) {
    if (!multiplier.isFinite || multiplier <= 0 || multiplier > 10 || served == null) throw ArgumentError('Invalid repeat portion');
    return Tier1Meal(id:newId,capturedAt:at,name:name,served:served!.scaled(multiplier),
      source:'confirmed_repeat',repeatOf:id,metadata:{'portionMultiplier':multiplier,'referenceIsWeighed':false});
  }
  Map<String,dynamic> toJson() => {'schemaVersion':1,'id':id,'capturedAt':capturedAt.toIso8601String(),
    'name':name,'served':served?.toJson(),'photoPath':photoPath,'metadata':metadata,
    'analysis':analysis,'consumedFraction':consumedFraction,'consumptionSource':consumptionSource,
    'cloudConsent':cloudConsent,'consentVersion':cloudConsent?'tier1-v1':null,
    'source':source,'revision':revision,'repeatOf':repeatOf};
  factory Tier1Meal.fromJson(Map<String,dynamic> value) {
    if (value['schemaVersion'] != 1) throw const FormatException('Unsupported local meal version');
    return Tier1Meal(id:value['id'] as String,capturedAt:DateTime.parse(value['capturedAt'] as String),
      name:value['name'] as String,served:value['served']==null?null:Tier1Nutrients.fromJson(Map<String,dynamic>.from(value['served'] as Map)),
      photoPath:value['photoPath'] as String?,metadata:Map<String,dynamic>.from(value['metadata'] as Map),
      analysis:value['analysis']==null?null:Map<String,dynamic>.from(value['analysis'] as Map),
      consumedFraction:(value['consumedFraction'] as num?)?.toDouble(),
      cloudConsent:value['cloudConsent']==true && value['consentVersion']=='tier1-v1',
      source:value['source'] as String,revision:value['revision'] as int,repeatOf:value['repeatOf'] as String?);
  }
}

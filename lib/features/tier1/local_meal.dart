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
    this.revision = 0, this.repeatOf, Map<int,double> portionOverrides = const {},
    List<Map<String,dynamic>> adjustmentHistory = const []})
    : portionOverrides=Map.unmodifiable(portionOverrides),
      adjustmentHistory=List.unmodifiable(adjustmentHistory.map((e)=>Map<String,dynamic>.unmodifiable(e))) {
    if (!RegExp(r'^[a-zA-Z0-9_-]{1,80}$').hasMatch(id) || name.trim().isEmpty ||
        name.length > 160 || revision < 0) {
      throw ArgumentError('Invalid meal record');
    }
    if (consumedFraction != null && (!consumedFraction!.isFinite || consumedFraction! < 0 || consumedFraction! > 1 || served == null)) {
      throw ArgumentError('Invalid confirmed consumption');
    }
    if(portionOverrides.isNotEmpty){
      final (components,baseline)=_portionBasis();
      for(final entry in portionOverrides.entries){
        if(entry.key<0||entry.key>=components.length||!entry.value.isFinite||entry.value<0||entry.value>100000){
          throw ArgumentError('Invalid saved portion');
        }
      }
      if(!_sameNutrients(served,_sumComponents(components,portionOverrides,baseline:baseline),approximate:true)){
        throw ArgumentError('Saved portions and served totals disagree');
      }
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
  final Map<int,double> portionOverrides;
  final List<Map<String,dynamic>> adjustmentHistory;
  double? get consumedKcal => consumedFraction == null ? null : served!.kcal*consumedFraction!;
  String get consumptionSource => consumedFraction == null ? 'served_only' : 'confirmed_fraction';

  Tier1Meal _copy({String? name,Tier1Nutrients? served,bool? cloudConsent,
    int? revision,Map<String,dynamic>? analysis,String? source,
    double? fraction,bool resetConsumption=false,Map<int,double>? portionOverrides,
    List<Map<String,dynamic>>? adjustmentHistory}) => Tier1Meal(id:id,
    capturedAt:capturedAt,name:name??this.name,served:served??this.served,
    photoPath:photoPath,metadata:metadata,analysis:analysis??this.analysis,
    cloudConsent:cloudConsent??this.cloudConsent,source:source??this.source,
    revision:revision??this.revision,repeatOf:repeatOf,
    portionOverrides:portionOverrides??this.portionOverrides,
    adjustmentHistory:adjustmentHistory??this.adjustmentHistory,
    consumedFraction:resetConsumption?null:fraction??consumedFraction);
  Tier1Meal withRevision(int value) => _copy(revision:value);
  Tier1Meal withConsent() => _copy(cloudConsent:true);
  Tier1Meal confirmConsumption(double fraction) => _copy(fraction:fraction);
  Tier1Meal clearConsumption() => _copy(resetConsumption:true);
  static const _nutrientKeys=['kcal','proteinG','carbsG','fatG'];
  static bool _sameNutrients(Tier1Nutrients? a,Tier1Nutrients? b,{bool approximate=false}) {
    if(a==null||b==null)return a==b;
    final left=a.toJson(),right=b.toJson();
    return _nutrientKeys.every((key){
      final x=left[key] as double?,y=right[key] as double?;
      return x==y||(approximate&&x!=null&&y!=null&&(x-y).abs()<=.000001);
    });
  }
  static Tier1Nutrients _sumComponents(List<Map<String,dynamic>> components,Map<int,double> overrides,{Tier1Nutrients? baseline}) {
    // Returning the baseline also restores its exact stored floating-point values.
    if(overrides.isEmpty&&baseline!=null)return baseline;
    final totals=<String,dynamic>{for(final key in _nutrientKeys)key:0.0};
    for(var index=0;index<components.length;index++){
      final component=components[index];
      final original=(component['massG'] as num).toDouble();
      final factor=(overrides[index]??original)/original;
      final nutrients=Tier1Nutrients.fromJson(Map<String,dynamic>.from(component['nutrients'] as Map)).toJson();
      for(final key in _nutrientKeys){
        final n=nutrients[key] as double?;
        // An unknown amount stays unknown even when that food is excluded.
        totals[key]=totals[key]==null||n==null?null:(totals[key] as double)+n*factor;
      }
    }
    if(baseline!=null){
      for(final key in _nutrientKeys){if(baseline.toJson()[key]==null)totals[key]=null;}
    }
    return Tier1Nutrients.fromJson(totals);
  }
  (List<Map<String,dynamic>>,Tier1Nutrients) _portionBasis() {
    final value=analysis;
    if(value==null)throw StateError('No original food estimate');
    final components=(value['components'] as List).map((c)=>Map<String,dynamic>.from(c as Map)).toList();
    if(components.isEmpty)throw StateError('No original food portions');
    for(final component in components){
      final mass=(component['massG'] as num).toDouble();
      if(!mass.isFinite||mass<=0||mass>100000)throw StateError('Invalid original portion');
    }
    final baseline=Tier1Nutrients.fromJson(Map<String,dynamic>.from(value['totals'] as Map));
    final sum=_sumComponents(components,const {}).toJson(),declared=baseline.toJson();
    for(final key in _nutrientKeys){
      final n=declared[key] as double?,s=sum[key] as double?;
      if(n!=null&&(s==null||(n-s).abs()>.000001))throw StateError('Original food totals disagree');
    }
    return (components,baseline);
  }
  bool get canCorrectPortions {
    try{_portionBasis();return true;}catch(_){return false;}
  }
  double componentMassG(int index) {
    final (components,_)=_portionBasis();
    RangeError.checkValidIndex(index,components);
    return portionOverrides[index]??(components[index]['massG'] as num).toDouble();
  }
  bool get hasManualNutritionOverride {
    if(analysis==null||served==null)return false;
    try{
      final (components,baseline)=_portionBasis();
      return !_sameNutrients(served,_sumComponents(components,portionOverrides,baseline:baseline),approximate:true);
    }catch(_){
      try{return !_sameNutrients(served,Tier1Nutrients.fromJson(Map<String,dynamic>.from(analysis!['totals'] as Map)),approximate:true);}
      catch(_){return true;}
    }
  }
  bool get hasPendingPreparationQuestion {
    final question=analysis?['question'];
    return canCorrectPortions&&!hasManualNutritionOverride&&question is Map&&question['answered']!=true&&question['options'] is List;
  }
  List<Map<String,dynamic>> _record(String kind,DateTime? at,Map<String,dynamic> change) => [
    ...adjustmentHistory,{'kind':kind,'at':at?.toUtc().toIso8601String(),
      'previous':{'name':name,'analysis':analysis,'served':served?.toJson(),'source':source,
        'portionOverrides':{for(final e in portionOverrides.entries)e.key.toString():e.value}},
      'change':change},
  ];
  Tier1Meal correctPortion(int index,double grams,{required DateTime at}) {
    if(!grams.isFinite||grams<0||grams>100000)throw ArgumentError('Invalid served grams');
    if(!canCorrectPortions)throw StateError('Original estimate cannot be recalculated');
    final (components,baseline)=_portionBasis();
    RangeError.checkValidIndex(index,components);
    final current=componentMassG(index);
    if(grams==current)return this;
    final original=(components[index]['massG'] as num).toDouble();
    final overrides=Map<int,double>.from(portionOverrides);
    if(grams==original){overrides.remove(index);}else{overrides[index]=grams;}
    return _copy(served:_sumComponents(components,overrides,baseline:baseline),
      portionOverrides:overrides,source:'portion_correction',resetConsumption:true,
      adjustmentHistory:_record('portion',at,{'componentIndex':index,'fromG':current,'toG':grams,'originalG':original}));
  }
  Tier1Meal edit(String name,Tier1Nutrients nutrients,{DateTime? at}) {
    final sameNutrition=_sameNutrients(served,nutrients);
    if(name.trim()==this.name && sameNutrition)return this;
    return _copy(name:name.trim(),served:nutrients,source:'manual_correction',resetConsumption:!sameNutrition,
      portionOverrides:sameNutrition?portionOverrides:const {},
      adjustmentHistory:served==null&&analysis==null?adjustmentHistory:
        _record(sameNutrition?'rename':'manual_totals',at,{'name':name.trim(),'served':nutrients.toJson()}));
  }
  Tier1Meal answerPreparation(String answer,{DateTime? at}) {
    if(!hasPendingPreparationQuestion)throw StateError('No active preparation question');
    final value=Map<String,dynamic>.from(analysis!);
    final rawQuestion=value['question'];
    if(rawQuestion is! Map || rawQuestion['answered']==true)throw StateError('No unanswered question');
    final question=Map<String,dynamic>.from(rawQuestion);
    final options=(question['options'] as List).map((o)=>Map<String,dynamic>.from(o as Map));
    final option=options.where((o)=>o['id']==answer).firstOrNull;
    if(option==null)throw ArgumentError('Unsupported preparation answer');
    final components=(value['components'] as List).map((c)=>Map<String,dynamic>.from(c as Map)).toList();
    if(option['component']!=null)components.add(Map<String,dynamic>.from(option['component'] as Map));
    final oldBaseline=Tier1Nutrients.fromJson(Map<String,dynamic>.from(value['totals'] as Map));
    final totals=option['component']==null?oldBaseline:_sumComponents(components,const {});
    final declared=totals.toJson();
    for(final key in _nutrientKeys){if(oldBaseline.toJson()[key]==null)declared[key]=null;}
    final baseline=Tier1Nutrients.fromJson(declared);
    value['components']=components;value['totals']=baseline.toJson();
    value['question']={...question,'answered':true,'answer':answer};
    value['userPreparationAnswer']=option['label'];
    return _copy(analysis:value,served:_sumComponents(components,portionOverrides,baseline:baseline),
      source:portionOverrides.isEmpty?'A1':'portion_correction',resetConsumption:true,
      adjustmentHistory:_record('preparation_answer',at,{'answer':answer}));
  }
  Tier1Meal withAnalysis(Map<String,dynamic> value,{DateTime? at}) => _copy(
    name:value['mealName'] as String,served:Tier1Nutrients.fromJson(Map<String,dynamic>.from(value['totals'] as Map)),
    analysis:value,source:'A1',resetConsumption:true,portionOverrides:const {},
    adjustmentHistory:analysis==null&&served==null?adjustmentHistory:
      _record('new_estimate',at,{'mealName':value['mealName']}));
  Tier1Meal repeat(String newId,DateTime at,double multiplier) {
    if (!multiplier.isFinite || multiplier <= 0 || multiplier > 10 || served == null) throw ArgumentError('Invalid repeat portion');
    return Tier1Meal(id:newId,capturedAt:at,name:name,served:served!.scaled(multiplier),
      source:'confirmed_repeat',repeatOf:id,metadata:{'portionMultiplier':multiplier,'referenceIsWeighed':false});
  }
  Map<String,dynamic> toJson() => {'schemaVersion':1,'id':id,'capturedAt':capturedAt.toIso8601String(),
    'name':name,'served':served?.toJson(),'photoPath':photoPath,'metadata':metadata,
    'analysis':analysis,'consumedFraction':consumedFraction,'consumptionSource':consumptionSource,
    'cloudConsent':cloudConsent,'consentVersion':cloudConsent?'tier1-v1':null,
    'source':source,'revision':revision,'repeatOf':repeatOf,
    if(portionOverrides.isNotEmpty)'portionOverrides':{for(final e in portionOverrides.entries)e.key.toString():e.value},
    if(adjustmentHistory.isNotEmpty)'adjustmentHistory':adjustmentHistory};
  factory Tier1Meal.fromJson(Map<String,dynamic> value) {
    if (value['schemaVersion'] != 1) throw const FormatException('Unsupported local meal version');
    return Tier1Meal(id:value['id'] as String,capturedAt:DateTime.parse(value['capturedAt'] as String),
      name:value['name'] as String,served:value['served']==null?null:Tier1Nutrients.fromJson(Map<String,dynamic>.from(value['served'] as Map)),
      photoPath:value['photoPath'] as String?,metadata:Map<String,dynamic>.from(value['metadata'] as Map),
      analysis:value['analysis']==null?null:Map<String,dynamic>.from(value['analysis'] as Map),
      consumedFraction:(value['consumedFraction'] as num?)?.toDouble(),
      cloudConsent:value['cloudConsent']==true && value['consentVersion']=='tier1-v1',
      source:value['source'] as String,revision:value['revision'] as int,repeatOf:value['repeatOf'] as String?,
      portionOverrides:{for(final e in (value['portionOverrides'] as Map? ?? {}).entries)
        _portionIndex(e.key): (e.value as num).toDouble()},
      adjustmentHistory:(value['adjustmentHistory'] as List? ?? []).map((e)=>Map<String,dynamic>.from(e as Map)).toList());
  }
  static int _portionIndex(dynamic key){
    if(key is! String)throw const FormatException('Invalid portion index');
    final index=int.tryParse(key);
    if(index==null||index.toString()!=key)throw const FormatException('Invalid portion index');
    return index;
  }
}

import 'dart:convert';
import 'manual_nutrient_catalog_data.dart';

// Explicit local selections only; automatic inference keeps its original catalog.
const manualFoodCatalogVersion='usda-sr-2018-tier1-20261108-v2';
const manualFoodCatalogSha256='bad3d924253513d093728351436cdcc6e099caba25eead2cae24778ea35ff178';
class ManualFoodRecord {
  const ManualFoodRecord({required this.id,required this.description,required this.preparation,required this.per100,required this.sourceUrl,required this.sourceArchiveSha256,required this.sourceRowSha256});
  final String id,description,preparation,sourceUrl,sourceArchiveSha256,sourceRowSha256;
  final Map<String,double> per100;
}
final List<ManualFoodRecord> _records=_load();
List<ManualFoodRecord> _load(){
  final value=jsonDecode(manualFoodCatalogRawJson) as Map;
  if(value['version']!=manualFoodCatalogVersion||manualFoodCatalogDataSha256!=manualFoodCatalogSha256){
    throw const FormatException('Manual nutrient catalog version mismatch');
  }
  return List.unmodifiable((value['records'] as List).map((raw)=>ManualFoodRecord(
    id:raw['id'] as String,description:raw['description'] as String,
    preparation:raw['preparation'] as String,
    per100:Map.unmodifiable((raw['per100'] as Map).map((k,v)=>MapEntry(k as String,(v as num).toDouble()))),
    sourceUrl:raw['sourceUrl'] as String,sourceArchiveSha256:raw['sourceArchiveSha256'] as String,
    sourceRowSha256:raw['sourceRowSha256'] as String)));
}
final Map<String,ManualFoodRecord> _byId=Map.unmodifiable({for(final record in _records)record.id:record});
List<ManualFoodRecord> get manualFoods=>_records;
ManualFoodRecord? manualFood(String id)=>_byId[id];
String _normalize(String value){
  var result=value.toLowerCase();
  const groups={'a':'àáâãäå','c':'ç','e':'èéêë','i':'ìíîï','n':'ñ','o':'òóôõö','u':'ùúûü','y':'ýÿ'};
  for(final entry in groups.entries){for(final rune in entry.value.runes){result=result.replaceAll(String.fromCharCode(rune),entry.key);}}
  return result.replaceAll(RegExp(r'[^a-z0-9]+'),' ').trim();
}
List<ManualFoodRecord> searchManualFoods(String query){
  final tokens=_normalize(query).split(' ').where((t)=>t.isNotEmpty).toList();
  return List.unmodifiable(_records.where((record){
    final text=_normalize('${record.description} ${record.preparation}');
    return tokens.every(text.contains);
  }));
}

// Tests-first interface; algorithms follow the recorded behavioral RED.
const manualFoodCatalogVersion='usda-sr-2018-tier1-20261108-v2';
const manualFoodCatalogSha256='bad3d924253513d093728351436cdcc6e099caba25eead2cae24778ea35ff178';
class ManualFoodRecord {
  const ManualFoodRecord({required this.id,required this.description,required this.preparation,required this.per100,required this.sourceUrl,required this.sourceArchiveSha256,required this.sourceRowSha256});
  final String id,description,preparation,sourceUrl,sourceArchiveSha256,sourceRowSha256;
  final Map<String,double> per100;
}
List<ManualFoodRecord> get manualFoods=>throw UnimplementedError();
ManualFoodRecord? manualFood(String id)=>throw UnimplementedError();
List<ManualFoodRecord> searchManualFoods(String query)=>throw UnimplementedError();

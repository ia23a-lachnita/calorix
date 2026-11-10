import 'package:flutter/material.dart';
import 'manual_nutrient_catalog.dart';

class ManualFoodSelection {
  const ManualFoodSelection(this.recordId);
  final String? recordId;
}

/// Optional local lookup. A record selection never verifies the pictured food.
class FoodSelectionDialog extends StatefulWidget {
  const FoodSelectionDialog({super.key,required this.name,required this.grams,
    this.recordId,this.manualTotals=false,this.extraOil=false});
  final String name,grams;
  final String? recordId;
  final bool manualTotals,extraOil;
  @override State<FoodSelectionDialog> createState()=>_FoodSelectionDialogState();
}
class _FoodSelectionDialogState extends State<FoodSelectionDialog> {
  final _search=TextEditingController();
  late String? _selected=widget.recordId;
  bool _closed=false;
  void _finish(ManualFoodSelection? value){
    if(_closed)return;
    _closed=true;Navigator.pop(context,value);
  }
  @override void dispose(){_search.dispose();super.dispose();}
  @override Widget build(BuildContext context){
    final records=searchManualFoods(_search.text);
    final selected=_selected==null?null:manualFood(_selected!);
    return AlertDialog(scrollable:true,title:const Text('Change food'),content:SizedBox(width:420,child:Column(
      mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text('Current food: ${widget.name}. Current estimated portion: ${widget.grams} g. Changing the food keeps these grams; check the portion afterwards.'),
        if(widget.manualTotals)const Text('Applying a different food replaces manual totals with a calculation from the listed foods.'),
        if(widget.extraOil)const Text('Your separate extra-oil component is retained. If oil is already included in your chosen food, check that component; use 0 g to exclude it.'),
        TextField(controller:_search,onChanged:(_)=>setState((){}),decoration:const InputDecoration(labelText:'Search nutrient records')),
        const Text('Choose a preparation that fits. This is a limited local list; use manual totals if your recipe is missing.'),
        SizedBox(height:220,child:records.isEmpty?const Center(child:Text('No matching records')):ListView.builder(
          itemCount:records.length,itemBuilder:(_,index){final record=records[index];return ListTile(
            selected:_selected==record.id,leading:Icon(_selected==record.id?Icons.check_circle:Icons.circle_outlined),
            title:Text(record.description),subtitle:Text('${record.preparation} · ${record.per100['kcal']} kcal / 100 g'),
            onTap:()=>setState(()=>_selected=record.id));})),
        if(selected!=null)...[
          Text('Selected: ${selected.description}'),
          Text('Per 100 g: ${selected.per100['kcal']} kcal · protein ${selected.per100['proteinG']} g · carbs ${selected.per100['carbsG']} g · fat ${selected.per100['fatG']} g'),
          Text('USDA SR Legacy · ${selected.id}'),SelectableText(selected.sourceUrl),
          const Text('User-selected nutrient record; food match and portion remain approximate.'),
        ],
      ])),actions:[
        TextButton(onPressed:()=>_finish(null),child:const Text('Cancel')),
        TextButton(onPressed:()=>_finish(const ManualFoodSelection(null)),child:const Text('Use predicted food')),
        FilledButton(onPressed:selected==null?null:()=>_finish(ManualFoodSelection(selected.id)),child:const Text('Apply food')),
      ]);
  }
}

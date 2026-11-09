import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'workflow_measurements.dart';

/// Data leaves app-private storage only after the explicit copy action.
Future<void> showWorkflowExport(BuildContext context,{required Future<Map<String,dynamic>> Function() load}) async {
  var closed=false,busy=false;String? error;
  final messenger=ScaffoldMessenger.of(context);
  await showDialog<void>(context:context,builder:(dialogContext)=>StatefulBuilder(builder:(context,update)=>AlertDialog(
    title:const Text('Export workflow measurements'),
    content:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('Copies timing events, estimated calories and portion changes. No photos or food names are included. The clipboard copy is outside this app’s deletion controls. Foreground timing includes reading and idle time; it is not a precise measure of active effort.'),
      if(error!=null)Padding(padding:const EdgeInsets.only(top:12),child:Text(error!)),
    ]),actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Cancel')),
      FilledButton(onPressed:busy?null:()async{
        update((){busy=true;error=null;});
        try{
          final value=await load();if(closed||!dialogContext.mounted)return;
          final text=encodeWorkflowExport(value);if(closed||!dialogContext.mounted)return;
          await Clipboard.setData(ClipboardData(text:text));if(closed||!dialogContext.mounted)return;
          Navigator.pop(dialogContext);messenger.showSnackBar(const SnackBar(content:Text('Workflow measurements copied.')));
        }catch(e){
          if(closed||!dialogContext.mounted)return;
          update((){busy=false;error=e is WorkflowExportTooLarge?'Too much data for the clipboard. Export one meal instead.':'Measurements could not be exported. Existing meals were preserved.';});
        }
      },child:Text(busy?'Preparing…':'Copy JSON'))],
  ))).whenComplete(()=>closed=true);
}

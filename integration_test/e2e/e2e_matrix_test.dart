import 'package:integration_test/integration_test.dart';

import 'meal_flow_test.dart' as meal_flow;
import 'barcode_flow_test.dart' as barcode_flow;
import 'label_flow_test.dart' as label_flow;
import 'manual_flow_test.dart' as manual_flow;
import 'review_flow_test.dart' as review_flow;
import 'crud_test.dart' as crud;
import 'goals_flow_test.dart' as goals_flow;
import 'assistant_flow_test.dart' as assistant_flow;
import 'notification_return_test.dart' as notification_return;
import 'interrupted_upload_test.dart' as interrupted_upload;
import 'profile_return_test.dart' as profile_return;
import 'swipe_nav_test.dart' as swipe_nav;
import 'device_state_test.dart' as device_state;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  meal_flow.main();
  barcode_flow.main();
  label_flow.main();
  manual_flow.main();
  review_flow.main();
  crud.main();
  goals_flow.main();
  assistant_flow.main();
  notification_return.main();
  interrupted_upload.main();
  profile_return.main();
  swipe_nav.main();
  device_state.main();
}

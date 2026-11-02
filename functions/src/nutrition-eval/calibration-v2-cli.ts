/** Explicit opt-in main; native composition is loaded only after pure validation. */
import { validateCalibrationCliInvocation } from './calibration-cli';
import type { CalibrationCliResult } from './calibration-cli';

if (require.main === module) {
  const argv = process.argv.slice(2);
  const validation = validateCalibrationCliInvocation(argv, process.env);
  const print = (result: Readonly<CalibrationCliResult>): void => {
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.exitCode;
  };
  if (!validation.valid) print(validation.result);
  else void import('./calibration-v2-native-cli').then(native => native.runNativeCalibrationV2Cli(argv, process.env))
    .then(print).catch(() => print({ exitCode: 1, failureCode: 'stage_failed' }));
}

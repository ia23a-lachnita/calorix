export interface ScanPushMessage {
  token: string;
  notification: {
    title: string;
    body: string;
  };
  data: { entryId: string };
  android: { priority: 'high' };
}

export function buildScanCompletePush(args: {
  appDisplayName: string;
  foodName: string;
  kcal: number;
  entryId: string;
  token: string;
}): ScanPushMessage {
  return {
    token: args.token,
    notification: {
      title: `${args.appDisplayName} finished your meal scan`,
      body: `${args.foodName} · ${Math.round(args.kcal)} kcal`,
    },
    data: { entryId: args.entryId },
    android: { priority: 'high' },
  };
}

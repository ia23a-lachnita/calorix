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

/**
 * Low-confidence results never claim to be logged: the notification opens the
 * review flow instead of implying the food was already counted.
 */
export function buildScanReviewPush(args: {
  appDisplayName: string;
  foodName: string;
  entryId: string;
  token: string;
}): ScanPushMessage {
  return {
    token: args.token,
    notification: {
      title: `${args.appDisplayName} scan ready to review`,
      body: `Is this ${args.foodName}? Confirm or correct it.`,
    },
    data: { entryId: args.entryId },
    android: { priority: 'high' },
  };
}

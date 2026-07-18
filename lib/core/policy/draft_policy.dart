enum DraftType { foodEdit, manualEntry, goalsEdit, chatComposition, searchFilters }

enum DraftPolicy { confirmDestructiveExit, discardWithNotice }

DraftPolicy draftPolicyFor(DraftType type) => switch (type) {
      DraftType.foodEdit || DraftType.manualEntry || DraftType.goalsEdit => DraftPolicy.confirmDestructiveExit,
      DraftType.chatComposition || DraftType.searchFilters => DraftPolicy.discardWithNotice,
    };

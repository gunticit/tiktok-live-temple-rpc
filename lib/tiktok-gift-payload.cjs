'use strict';

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeGiftPayload(data = {}, uniqueId = '') {
  const gift = { ...(data.giftDetails || {}), ...(data.gift || {}) };
  const extended = data.extendedGiftInfo || {};
  const rawGiftId = firstDefined(data.giftId, data.gift_id, gift.id, gift.giftId, gift.gift_id);
  const rawGiftName = firstDefined(
    data.giftName,
    gift.giftName,
    gift.name,
    extended.name,
    extended.giftName,
    gift.describe,
    data.describe
  );
  const rawDiamonds = firstDefined(
    gift.diamondCount,
    gift.diamond_count,
    data.diamondCount,
    extended.diamondCount,
    extended.diamond_count
  );
  const parsedDiamonds = Number(rawDiamonds);
  const parsedRepeat = Number(firstDefined(
    data.repeatCount,
    data.comboCount,
    data.repeat_count,
    data.combo_count,
    gift.repeatCount,
    gift.repeat_count,
    1
  ));
  const giftType = Number(firstDefined(
    gift.giftType,
    gift.type,
    data.giftType,
    gift.gift_type,
    data.gift_type,
    0
  ));

  const giftImage = String(firstDefined(
    data.giftPictureUrl,
    gift.giftImage?.giftPictureUrl,
    gift.giftImage?.urlList?.[0],
    gift.giftImage?.url?.[0],
    gift.image?.urlList?.[0],
    gift.image?.url?.[0],
    gift.icon?.urlList?.[0],
    extended.image?.url_list?.[0],
    extended.icon?.url_list?.[0],
    ''
  ) || '').trim();

  const giftId = rawGiftId == null ? '' : String(rawGiftId).slice(0, 80);
  const giftName = rawGiftName == null ? '' : String(rawGiftName).slice(0, 120);
  const diamondCount = Number.isFinite(parsedDiamonds) && parsedDiamonds >= 1 ? parsedDiamonds : 1;
  const repeatCount = Number.isFinite(parsedRepeat) ? Math.max(1, Math.floor(parsedRepeat)) : 1;
  const rawRepeatEnd = firstDefined(data.repeatEnd, data.repeat_end, gift.repeatEnd, gift.repeat_end);
  const repeatEnd = rawRepeatEnd === true || rawRepeatEnd === 1 ||
    rawRepeatEnd === '1' || rawRepeatEnd === 'true';
  const groupId = String(firstDefined(
    data.groupId,
    data.group_id,
    gift.groupId,
    gift.group_id,
    `${uniqueId}|${giftId || giftName || `unknown:${diamondCount}`}`
  )).slice(0, 180);

  return {
    giftId,
    giftName,
    giftImage,
    diamondCount,
    repeatCount,
    repeatEnd,
    giftType,
    streakable: giftType === 1,
    groupId
  };
}

/**
 * Convert cumulative TikTok streak updates into incremental gift counts.
 * Non-streakable gifts are independent events and never share tracker state.
 * A final repeatEnd frame clears the streak, and a subsequent combo starts with a clean counter.
 */
function getGiftComboDelta(tracker, payload, maxEntries = 500) {
  const { groupId, repeatCount, repeatEnd, streakable } = payload;
  if (!streakable) return repeatCount;

  const previousCount = tracker.get(groupId) || 0;
  const deltaCount = Math.max(0, repeatCount - previousCount);

  // Duplicate cumulative frames must not mint another gift/reward. The final
  // frame always closes the streak, even when it repeats an earlier count.
  if (repeatEnd) {
    tracker.delete(groupId);
  } else if (deltaCount > 0) {
    tracker.set(groupId, repeatCount);
    while (tracker.size > maxEntries) {
      const oldestKey = tracker.keys().next().value;
      if (oldestKey === undefined) break;
      tracker.delete(oldestKey);
    }
  }
  return deltaCount;
}

module.exports = { normalizeGiftPayload, getGiftComboDelta };

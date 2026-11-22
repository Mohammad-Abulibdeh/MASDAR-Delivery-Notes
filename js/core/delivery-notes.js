/**
 * Delivery-note domain logic: validation, net-weight calculation, change detection.
 * Pure functions - no storage, no DOM - so they can be unit-tested in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./format.js'));
  else (root.Masdar = root.Masdar || {}).Notes = factory(root.Masdar.Format);
})(typeof self !== 'undefined' ? self : this, function (F) {
  'use strict';

  const LIMITS = {
    maxWeightKg: 200000,      // 200 t - anything above is certainly a typing error
    driverMin: 3, driverMax: 60,
    plateMax: 20,
  };

  /** Fields the user may edit (create + History edit). Everything else is fixed. */
  const EDITABLE_FIELDS = ['driverName', 'plateNumber', 'trailerNumber', 'tareKg', 'grossKg'];

  const PLATE_RE = /^[0-9A-Z؀-ۿ\-\/ ]+$/;
  /** Shared rule for the truck plate and the trailer (عرباي) number. */
  function plateError(value, required) {
    if (!value) return required ? 'err.required' : null;
    if (value.length > LIMITS.plateMax) return 'err.plateLong';
    if (!PLATE_RE.test(value) || !/\d/.test(value)) return 'err.plateChars';
    return null;
  }

  /**
   * Validate raw form input.
   * @returns {{ok:boolean, errors:Object<string,string>, values:Object}}
   *   errors are i18n keys; values are cleaned/normalised (weights in kg).
   */
  function validate(raw) {
    const errors = {};
    const driverName = F.cleanText(raw.driverName);
    const plateNumber = F.cleanText(F.normalizeDigits(raw.plateNumber)).toUpperCase();
    // Trailer (عرباي) number is optional - not every truck pulls a trailer.
    const trailerNumber = F.cleanText(F.normalizeDigits(raw.trailerNumber)).toUpperCase();
    const tareStr = F.cleanText(raw.tare);
    const grossStr = F.cleanText(raw.gross);

    if (!driverName) errors.driverName = 'err.required';
    else if (driverName.length < LIMITS.driverMin) errors.driverName = 'err.driverShort';
    else if (driverName.length > LIMITS.driverMax) errors.driverName = 'err.driverLong';
    else if (/[<>{}\[\]\\|@#$%^*=+~`"]/.test(driverName) || /\d/.test(F.normalizeDigits(driverName)))
      errors.driverName = 'err.driverChars';

    const plateErr = plateError(plateNumber, true);
    if (plateErr) errors.plateNumber = plateErr;
    const trailerErr = plateError(trailerNumber, false);
    if (trailerErr) errors.trailerNumber = trailerErr;

    const tareKg = tareStr === '' ? null : F.parseTonsToKg(tareStr);
    const grossKg = grossStr === '' ? null : F.parseTonsToKg(grossStr);

    if (tareStr === '') errors.tare = 'err.required';
    else if (tareKg === null) errors.tare = /^-/.test(tareStr) ? 'err.negative' : 'err.number';
    else if (tareKg <= 0) errors.tare = 'err.positive';
    else if (tareKg > LIMITS.maxWeightKg) errors.tare = 'err.tooHeavy';

    if (grossStr === '') errors.gross = 'err.required';
    else if (grossKg === null) errors.gross = /^-/.test(grossStr) ? 'err.negative' : 'err.number';
    else if (grossKg <= 0) errors.gross = 'err.positive';
    else if (grossKg > LIMITS.maxWeightKg) errors.gross = 'err.tooHeavy';

    if (!errors.tare && !errors.gross && grossKg <= tareKg) errors.gross = 'err.grossNotAboveTare';

    const netKg = tareKg != null && grossKg != null ? grossKg - tareKg : null;
    return {
      ok: Object.keys(errors).length === 0,
      errors,
      values: { driverName, plateNumber, trailerNumber, tareKg, grossKg, netKg },
    };
  }

  function computeNetKg(tareKg, grossKg) {
    if (!Number.isInteger(tareKg) || !Number.isInteger(grossKg)) return null;
    return grossKg - tareKg;
  }

  /** List of {field, old, new} for the editable fields that actually changed. */
  function diff(oldNote, newValues) {
    const changes = [];
    for (const f of EDITABLE_FIELDS) {
      // notes saved before the trailer field existed have it undefined -> treat as ''
      const old = f === 'trailerNumber' ? (oldNote[f] || '') : oldNote[f];
      if (newValues[f] !== undefined && newValues[f] !== old) {
        changes.push({ field: f, old, new: newValues[f] });
      }
    }
    return changes;
  }

  /**
   * Derived status for History:
   *  - 'new'      : saved, never printed / downloaded
   *  - 'printed'  : printed and unchanged since
   *  - 'reprint'  : edited after the last print -> should be printed again
   */
  function status(note) {
    if (!note.printCount) return 'new';
    if (note.lastEditedAt && note.lastPrintedAt && note.lastEditedAt > note.lastPrintedAt) return 'reprint';
    return 'printed';
  }

  return { LIMITS, EDITABLE_FIELDS, validate, computeNetKg, diff, status };
});

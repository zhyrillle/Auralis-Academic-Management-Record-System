const db = require('../config/db');

// DepEd MATATAG (SY 2026-2027) Official Transmutation Table (42 Tiers)
const OFFICIAL_DEPED_TABLE = [
  { min: 99.50, max: 100.00, transmuted: 100, label: null },
  { min: 97.50, max: 99.49, transmuted: 99, label: null },
  { min: 96.00, max: 97.49, transmuted: 98, label: null },
  { min: 95.00, max: 95.99, transmuted: 97, label: null },
  { min: 94.00, max: 94.99, transmuted: 96, label: null },
  { min: 93.00, max: 93.99, transmuted: 95, label: null },
  { min: 92.00, max: 92.99, transmuted: 94, label: null },
  { min: 91.00, max: 91.99, transmuted: 93, label: null },
  { min: 90.00, max: 90.99, transmuted: 92, label: null },
  { min: 89.00, max: 89.99, transmuted: 91, label: null },
  { min: 88.00, max: 88.99, transmuted: 90, label: null },
  { min: 87.00, max: 87.99, transmuted: 89, label: null },
  { min: 86.00, max: 86.99, transmuted: 88, label: null },
  { min: 85.00, max: 85.99, transmuted: 87, label: null },
  { min: 84.00, max: 84.99, transmuted: 86, label: null },
  { min: 83.00, max: 83.99, transmuted: 85, label: null },
  { min: 82.00, max: 82.99, transmuted: 84, label: null },
  { min: 81.00, max: 81.99, transmuted: 83, label: null },
  { min: 80.00, max: 80.99, transmuted: 82, label: null },
  { min: 79.00, max: 79.99, transmuted: 81, label: null },
  { min: 78.00, max: 78.99, transmuted: 80, label: null },
  { min: 77.00, max: 77.99, transmuted: 79, label: null },
  { min: 76.00, max: 76.99, transmuted: 78, label: null },
  { min: 75.00, max: 75.99, transmuted: 77, label: null },
  { min: 73.00, max: 74.99, transmuted: 76, label: null },
  { min: 70.00, max: 72.99, transmuted: 75, label: null }, // Passing grade 75
  { min: 68.00, max: 69.99, transmuted: 74, label: null },
  { min: 66.00, max: 67.99, transmuted: 73, label: null },
  { min: 64.00, max: 65.99, transmuted: 72, label: null },
  { min: 62.00, max: 63.99, transmuted: 71, label: null },
  { min: 60.00, max: 61.99, transmuted: 70, label: null },
  { min: 58.00, max: 59.99, transmuted: 69, label: null },
  { min: 56.00, max: 57.99, transmuted: 68, label: null },
  { min: 54.00, max: 55.99, transmuted: 67, label: null },
  { min: 52.00, max: 53.99, transmuted: 66, label: null },
  { min: 50.00, max: 51.99, transmuted: 65, label: null },
  { min: 48.00, max: 49.99, transmuted: 64, label: null },
  { min: 46.00, max: 47.99, transmuted: 63, label: null },
  { min: 43.00, max: 45.99, transmuted: 62, label: null },
  { min: 40.00, max: 42.99, transmuted: 61, label: null },
  { min: 25.00, max: 39.99, transmuted: 60, label: null },
  { min: 0.00, max: 24.00, transmuted: 60, label: 'default minimum' },
];

let cachedActiveConfig = null;
let cachedIsCustomEnabled = false;
let lastCacheTime = 0;
let isTableInitialized = false;
const CACHE_TTL_MS = 15000;

class GradeTransmutationConfig {
  static get OFFICIAL_TABLE() {
    return OFFICIAL_DEPED_TABLE.map((item, idx) => ({
      id: `default-${idx}`,
      min: Number(item.min).toFixed(2),
      max: Number(item.max).toFixed(2),
      transmuted: String(item.transmuted),
      label: item.label || null,
    }));
  }

  static async initTable() {
    if (isTableInitialized) return;
    const query = `
      CREATE TABLE IF NOT EXISTS GRADE_TRANSMUTATION_CONFIG (
        config_id INT PRIMARY KEY AUTO_INCREMENT,
        is_custom_enabled TINYINT(1) NOT NULL DEFAULT 0,
        ranges_json LONGTEXT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by BIGINT NULL,
        CONSTRAINT fk_gtc_user FOREIGN KEY (updated_by) REFERENCES USER(user_id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    try {
      await db.execute(query);
      const [rows] = await db.execute('SELECT config_id FROM GRADE_TRANSMUTATION_CONFIG WHERE config_id = 1');
      if (rows.length === 0) {
        await db.execute(
          'INSERT INTO GRADE_TRANSMUTATION_CONFIG (config_id, is_custom_enabled, ranges_json) VALUES (1, 0, NULL)'
        );
      }
      isTableInitialized = true;
      await this.getActiveTiers();
    } catch (err) {
      console.error('Error initializing GRADE_TRANSMUTATION_CONFIG:', err.message);
    }
  }

  static validateRanges(ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) {
      return 'At least one grade range is required.';
    }

    const parsed = [];
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      const min = Number(r.min);
      const max = Number(r.max);
      const transmuted = Number(r.transmuted);

      if (isNaN(min) || isNaN(max) || isNaN(transmuted)) {
        return `Row ${i + 1}: Minimum, maximum, and transmuted grade must be valid numbers.`;
      }
      if (min < 0 || max > 100) {
        return `Row ${i + 1}: Range initial values must be between 0.00 and 100.00.`;
      }
      if (min > max) {
        return `Row ${i + 1}: Minimum (${min}) cannot exceed maximum (${max}).`;
      }
      if (transmuted < 0 || transmuted > 100) {
        return `Row ${i + 1}: Transmuted grade must be between 0 and 100.`;
      }

      parsed.push({
        id: r.id || `row-${i}`,
        min: min.toFixed(2),
        max: max.toFixed(2),
        minNum: min,
        maxNum: max,
        transmuted: Math.round(transmuted),
        label: r.label || (min === 0 && max === 24 ? 'default minimum' : null),
      });
    }

    // Check for overlap
    const sorted = [...parsed].sort((a, b) => a.minNum - b.minNum);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.minNum <= prev.maxNum) {
        return `Range overlap detected: [${curr.minNum} - ${curr.maxNum}] overlaps with [${prev.minNum} - ${prev.maxNum}].`;
      }
    }

    return null;
  }

  static async getConfig() {
    await this.initTable();
    const [rows] = await db.execute(
      `SELECT gtc.*, u.first_name, u.last_name, u.email
       FROM GRADE_TRANSMUTATION_CONFIG gtc
       LEFT JOIN USER u ON u.user_id = gtc.updated_by
       WHERE gtc.config_id = 1`
    );

    const defaultRanges = this.OFFICIAL_TABLE;
    if (rows.length === 0) {
      cachedIsCustomEnabled = false;
      cachedActiveConfig = null;
      return {
        is_custom_enabled: false,
        ranges: defaultRanges,
        default_ranges: defaultRanges,
        updated_at: null,
        updated_by: null,
      };
    }

    const row = rows[0];
    let customRanges = null;
    if (row.ranges_json) {
      try {
        customRanges = JSON.parse(row.ranges_json);
      } catch (e) {
        console.error('Failed to parse ranges_json:', e);
      }
    }

    const isEnabled = Boolean(row.is_custom_enabled);
    cachedIsCustomEnabled = isEnabled;
    cachedActiveConfig = (isEnabled && customRanges)
      ? customRanges.map((r) => ({
          min: Number(r.min),
          max: Number(r.max),
          grade: Number(r.transmuted),
          transmuted: Number(r.transmuted),
          label: r.label || null,
        }))
      : null;
    lastCacheTime = Date.now();

    return {
      is_custom_enabled: isEnabled,
      ranges: (isEnabled && customRanges) ? customRanges : defaultRanges,
      saved_custom_ranges: customRanges,
      default_ranges: defaultRanges,
      updated_at: row.updated_at,
      updated_by: row.updated_by ? {
        user_id: row.updated_by,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email,
      } : null,
    };
  }

  static async saveConfig({ is_custom_enabled, ranges, updated_by = null }) {
    await this.initTable();

    const enabled = Boolean(is_custom_enabled);
    let serializedRanges = null;

    if (enabled) {
      const validationError = this.validateRanges(ranges);
      if (validationError) {
        const error = new Error(validationError);
        error.statusCode = 400;
        throw error;
      }

      // Format ranges neatly
      const formatted = ranges.map((r, idx) => ({
        id: r.id || `custom-${idx}`,
        min: Number(r.min).toFixed(2),
        max: Number(r.max).toFixed(2),
        transmuted: String(Math.round(Number(r.transmuted))),
        label: r.label || (Number(r.min) === 0 && Number(r.max) === 24 ? 'default minimum' : null),
      }));
      serializedRanges = JSON.stringify(formatted);
    }

    await db.execute(
      `INSERT INTO GRADE_TRANSMUTATION_CONFIG (config_id, is_custom_enabled, ranges_json, updated_by, updated_at)
       VALUES (1, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         is_custom_enabled = VALUES(is_custom_enabled),
         ranges_json = VALUES(ranges_json),
         updated_by = VALUES(updated_by),
         updated_at = NOW()`,
      [enabled ? 1 : 0, serializedRanges, updated_by]
    );

    // Invalidate cache
    cachedActiveConfig = null;
    cachedIsCustomEnabled = enabled;
    lastCacheTime = 0;

    return this.getConfig();
  }

  static async resetToDefault({ updated_by = null }) {
    await this.initTable();
    await db.execute(
      `UPDATE GRADE_TRANSMUTATION_CONFIG
       SET is_custom_enabled = 0, ranges_json = NULL, updated_by = ?, updated_at = NOW()
       WHERE config_id = 1`,
      [updated_by]
    );

    // Invalidate cache
    cachedActiveConfig = null;
    cachedIsCustomEnabled = false;
    lastCacheTime = 0;

    return this.getConfig();
  }

  static async getActiveTiers() {
    const now = Date.now();
    if (lastCacheTime && (now - lastCacheTime < CACHE_TTL_MS)) {
      return cachedActiveConfig;
    }

    try {
      const config = await this.getConfig();
      cachedIsCustomEnabled = Boolean(config.is_custom_enabled);
      if (config.is_custom_enabled && Array.isArray(config.ranges) && config.ranges.length > 0) {
        cachedActiveConfig = config.ranges.map((r) => ({
          min: Number(r.min),
          max: Number(r.max),
          grade: Number(r.transmuted),
          transmuted: Number(r.transmuted),
          label: r.label || null,
        }));
      } else {
        // Option B: when custom transmutation is OFF, no transmutation table is active (grades are not transmuted)
        cachedActiveConfig = null;
      }
    } catch (err) {
      console.error('Failed to get active transmutation config:', err.message);
      cachedIsCustomEnabled = false;
      cachedActiveConfig = null;
    }

    lastCacheTime = now;
    return cachedActiveConfig;
  }

  static isCustomEnabledSync() {
    return cachedIsCustomEnabled === true;
  }

  static getActiveTiersSync() {
    if (!cachedIsCustomEnabled) return null;
    return cachedActiveConfig;
  }

  static transmuteSync(initialGrade, tiers = null) {
    if (initialGrade === null || initialGrade === undefined || initialGrade === '') {
      return null;
    }

    const numeric = Number(initialGrade);
    if (isNaN(numeric)) return null;

    // If caller explicitly passed tiers, transmute using those tiers
    if (Array.isArray(tiers) && tiers.length > 0) {
      if (numeric >= 100) return 100;
      if (numeric <= 0) return 60;
      const rounded = Math.round(numeric * 100) / 100;
      for (const tier of tiers) {
        if (rounded >= tier.min && rounded <= tier.max) {
          return tier.transmuted !== undefined ? tier.transmuted : tier.grade;
        }
      }
      return 60;
    }

    // Option B: When custom transmutation is OFF, grades are NOT transmuted
    if (!this.isCustomEnabledSync()) {
      return Math.min(100, Math.max(0, Math.round(numeric)));
    }

    const activeTiers = this.getActiveTiersSync();
    if (!activeTiers || activeTiers.length === 0) {
      return Math.min(100, Math.max(0, Math.round(numeric)));
    }

    if (numeric >= 100) return 100;
    if (numeric <= 0) return 60;

    const rounded = Math.round(numeric * 100) / 100;
    for (const tier of activeTiers) {
      if (rounded >= tier.min && rounded <= tier.max) {
        return tier.transmuted !== undefined ? tier.transmuted : tier.grade;
      }
    }
    return 60;
  }
}

module.exports = GradeTransmutationConfig;

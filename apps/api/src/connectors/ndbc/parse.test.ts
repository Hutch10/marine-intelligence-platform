import test from "node:test";
import assert from "node:assert/strict";
import { parseNdbcStationData } from "./parse";

const SAMPLE_FEED = `#YY  MM DD hh mm WDIR WSPD GST  WVHT DPD APD MWD PRES ATMP WTMP\n26 03 18 10 50 320  7.0 9.0 1.24  9  6.4 278 1015.6 18.3 17.1\n26 03 18 09 50 318  6.5 8.1 1.10  8  6.1 274 1015.1 18.1 16.9`;

test("parseNdbcStationData parses tabular rows with timestamps", () => {
  const rows = parseNdbcStationData(SAMPLE_FEED);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0]?.timestamp, {
    year: 2026,
    month: 3,
    day: 18,
    hour: 10,
    minute: 50,
  });
  assert.equal(rows[0]?.fields.WTMP, "17.1");
  assert.equal(rows[1]?.fields.WVHT, "1.10");
});

test("parseNdbcStationData skips invalid lines", () => {
  const rows = parseNdbcStationData("#YY MM DD hh mm WTMP\ninvalid data\n26 03 18 10 55 16.2");

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.fields.WTMP, "16.2");
});

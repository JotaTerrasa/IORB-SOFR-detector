import test from "node:test";
import assert from "node:assert/strict";
import { parseCalendar, referencePeriodLabel } from "../lib/calendar-data.js";
test("Fed calendar handles cross-month meetings and projections", () => {
  const html =
    '2026 FOMC Meetings<div class="fomc-meeting__month">Apr/May</div><div class="fomc-meeting__date">30-1*</div>2025 FOMC Meetings<div class="fomc-meeting__month">June</div><div class="fomc-meeting__date">17-18</div>';
  assert.deepEqual(parseCalendar(html, "fed"), [
    { start: "2025-06-17", date: "2025-06-18", projections: false },
    { start: "2026-04-30", date: "2026-05-01", projections: true },
  ]);
});
test("BLS calendar distinguishes reference period from release date", () => {
  const html =
    '<table class="release-list"><tr><td>October 2026</td><td>Nov. 10, 2026</td><td>08:30 AM</td></tr></table>';
  assert.deepEqual(parseCalendar(html, "cpi"), [
    { date: "2026-11-10", period: "October 2026", time: "08:30 AM" },
  ]);
  assert.throws(() => parseCalendar("<h1>Unavailable</h1>", "cpi"));
});

test("Reference month labels do not depend on browser date parsing", () => {
  assert.equal(referencePeriodLabel("October 2026"), "octubre de 2026");
  assert.equal(referencePeriodLabel("December 2026"), "diciembre de 2026");
  assert.equal(referencePeriodLabel("January 2027"), "enero de 2027");
  for (const value of [null, undefined, "", "Unknown 2026", "2026-10"])
    assert.equal(referencePeriodLabel(value), "periodo no disponible");
});

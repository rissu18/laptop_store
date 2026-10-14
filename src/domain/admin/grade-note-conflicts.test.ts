import { describe, expect, it } from "vitest";
import { customerConditionNotes, gradeNoteConflicts } from "./grade-note-conflicts";

describe("seisukord vs märkus", () => {
  it("A+ / Uus: igasugune nähtav jälg on vastuolu", () => {
    expect(gradeNoteConflicts("A+", ["Korpusest väike tükk puudu, mujalt A grade"])).toEqual(["tükk puudu / katkine korpus"]);
    expect(gradeNoteConflicts("A+", ["Kaas kulunud"])).toEqual(["kulumine / kriimustus"]);
    expect(gradeNoteConflicts("NEW", ["Demo mudel, originaalpakend puudub!"])).toEqual([]);
  });

  it("A: mõlk, mõra ja ekraani laik on vastuolus; kerge kulumine mitte", () => {
    expect(gradeNoteConflicts("A", ["Õrn mõlk kaanel"])).toEqual(["mõlk"]);
    expect(gradeNoteConflicts("A", ["Klaasil väga nõrk mõra, näeb ainult nurga alt."])).toEqual(["mõra / pragu", "ekraani laik / kahjustus"]);
    expect(gradeNoteConflicts("A", ["Ekraanil võivad esineda nõrgad laigud või kasutusjäljed."])).toEqual(["ekraani laik / kahjustus"]);
    expect(gradeNoteConflicts("A", ["Võib esineda väikeseid kosmeetilisi kasutusjälgi."])).toEqual([]);
  });

  it("liidese rike ei mõjuta klassi (määratluse järgi)", () => {
    expect(gradeNoteConflicts("A+", ["1 USB katki, teine töötab"])).toEqual([]);
    expect(gradeNoteConflicts("A", ["Üks USB-C ei tööta!"])).toEqual([]);
  });

  it("B lubab kulumist ja väikesi mõrasid; mõlk on vastuolu; C-d ei kontrollita", () => {
    expect(gradeNoteConflicts("B", ["Kaas kulunud"])).toEqual([]);
    expect(gradeNoteConflicts("B", ["mõra korpuses"])).toEqual([]);
    expect(gradeNoteConflicts("B", ["Nurgas väike mõlk"])).toEqual(["mõlk"]);
    expect(gradeNoteConflicts("C", ["Kaanes väike mõra", "Korpus kulunud"])).toEqual([]);
  });

  it("märkused: tarnija märkus + Foxway seisukorra märkused", () => {
    expect(customerConditionNotes({ conditionNotes: "Mõlk", details: { conditionNotices: [{ text: "Laigud" }] } })).toEqual(["Mõlk", "Laigud"]);
    expect(customerConditionNotes({ conditionNotes: null, details: null })).toEqual([]);
  });
});

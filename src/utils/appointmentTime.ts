/**
 * Rendez-vous : heures proposées et affichage. Fonctions pures, heure locale de l'appareil, aucun délai.
 * Les durées (30 min, 1 h) sont des raccourcis de saisie, pas des délais de jeu.
 */

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
// delay-ok: conversion d'unités pour des raccourcis de saisie, pas un délai de jeu
const MINUTE_MS = 60 * 1000;
const EVENING_HOUR = 20;

export interface QuickSlot {
  id: 'in30' | 'in60' | 'tonight' | 'tomorrow';
  label: string;
  startsAt: number;
}

function atHour(base: Date, dayOffset: number, hour: number): number {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, 0, 0, 0).getTime();
}

/** Raccourcis encore valables : assez loin pour l'avance minimale, assez près pour l'horizon. */
export function quickSlots(nowMs: number, minLeadMs: number, horizonMs: number): QuickSlot[] {
  const base = new Date(nowMs);
  const all: QuickSlot[] = [
    { id: 'in30', label: 'Dans 30 min', startsAt: nowMs + 30 * MINUTE_MS },
    { id: 'in60', label: 'Dans 1 h', startsAt: nowMs + 60 * MINUTE_MS },
    { id: 'tonight', label: 'Ce soir 20 h', startsAt: atHour(base, 0, EVENING_HOUR) },
    { id: 'tomorrow', label: 'Demain 20 h', startsAt: atHour(base, 1, EVENING_HOUR) },
  ];
  return all.filter((s) => s.startsAt - nowMs >= minLeadMs && s.startsAt - nowMs <= horizonMs);
}

function clock(date: Date): string {
  const m = date.getMinutes();
  return m === 0 ? `${date.getHours()} h` : `${date.getHours()} h ${String(m).padStart(2, '0')}`;
}

function dayDiff(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((da - db) / (24 * 60 * MINUTE_MS));
}

/** « Aujourd'hui à 20 h 30 », « Demain à 20 h », « Vendredi à 14 h ». */
export function formatAppointmentTime(startsAt: number, nowMs: number): string {
  const date = new Date(startsAt);
  const diff = dayDiff(date, new Date(nowMs));
  const day = diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Demain' : DAYS[date.getDay()].charAt(0).toUpperCase() + DAYS[date.getDay()].slice(1);
  return `${day} à ${clock(date)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Valeur d'un champ <input type="datetime-local"> (heure locale, à la minute). */
export function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Lecture inverse ; null si la valeur est vide ou illisible. */
export function fromDatetimeLocalValue(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

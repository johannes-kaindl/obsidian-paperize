---
title: Paperize Beispiel
autor: Johannes
---

# Paperize — Funktionsüberblick

Ein Absatz mit **fettem**, *kursivem* und `inline-code` Text sowie einem
[Link zu example.com](https://example.com). Dieser Absatz ist bewusst etwas
länger, damit der Zeilenumbruch der PDF-Engine sichtbar wird und mehrere
Zeilen entstehen.

## Aufzählungen

- Erster Punkt
- Zweiter Punkt mit Unterpunkten
    - Unterpunkt A
    - Unterpunkt B
- Dritter Punkt

## Nummerierte Liste

1. Schritt eins
2. Schritt zwei
3. Schritt drei

## Zitat

> Ein Blockzitat über die Qualität von PDF-Exporten.
> Zweite Zeile des Zitats.

## Code

```js
function hallo(name) {
  return `Hallo, ${name}!`;
}
```

## Tabelle

| Feld       | Typ     | Pflicht |
| ---------- | ------- | ------- |
| titel      | string  | ja      |
| datum      | date    | nein    |
| empfaenger | string  | ja      |

## Bild

![Beispielbild](beispiel.png)

---

Abschließender Absatz nach der Trennlinie.

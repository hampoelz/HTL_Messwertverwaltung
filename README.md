# 💾 Messwertverwaltung
ℹ Eine kleine Aufgabenstellung der [HTL Weiz](https://htlweiz.at/), bei der eine Messwertverwaltung verwirklicht werden soll.

## Aufgabenstellung
Messwertverwaltung (mit Historie)

**Datenbankaufbau:**
> Sensoren
> - Bezeichnung
> - Seriennummer
> - Hersteller
> - Herstellernummer
>
> Messwerte
> - Zahl
> - Zeitpunkt
>
> Physikalische Größe
> - Name
> - Einheit
> - Formelzeichen
>
> Standort
> - Bezeichnung
> - Koordinate (lat,lon)

Mehrere Sensoren befinden sich an einem Standort, ein Sensor liefert viele Messwerte, ein Messwert repräsentiert eine physikalische Größe.

Die Datenbank soll mit Beispieldaten gefüllt werden (mehrere Standorte, Sensoren, physikalische Größen, mind. Zweistellig viele Messwerte).

Ein Frontend zur Datenbank soll erstellt werden, das die Messwerte ausgibt/manipulierbar macht.
1. Einfach Messwerte ausgeben
2. Routen mit denen die Messwerte eingeschränkt werden können (z.B. nach Sensor, Standort, Physikalischer Größe …) http://localhost/standort/id123
3. Eine vollständige REST-API (Idealerweise JSON als Schnittstelle)
import { MapBrowser } from "@/components/MapBrowser";

export default function MapPage() {
  return (
    <section className="map-page shell">
      <div className="map-page-heading">
        <p className="eyebrow">Карта памяти</p>
        <h1>Истории, которые остаются с нами</h1>
        <p>Каждая точка опубликована владельцем как точное, приблизительное или символическое место.</p>
      </div>
      <MapBrowser />
    </section>
  );
}

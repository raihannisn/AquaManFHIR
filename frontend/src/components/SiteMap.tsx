import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { Site } from '../services/api'
import { EmptyState } from './ui'

const cityColors = ['#218e82', '#d46d55', '#c58c29', '#6d8db2', '#76904d', '#9878a6']

type MappableSite = Site & { latitude: number; longitude: number }
type Position = [number, number]

function hasCoordinates(site: Site): site is MappableSite {
  return typeof site.latitude === 'number' && Number.isFinite(site.latitude) && site.latitude >= -90 && site.latitude <= 90 &&
    typeof site.longitude === 'number' && Number.isFinite(site.longitude) && site.longitude >= -180 && site.longitude <= 180
}

function cityKey(site: Site): string {
  return site.cityId ?? site.cityName ?? 'City not supplied'
}

function FitSites({ positions, singleSite }: { positions: Position[]; singleSite: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 1) {
      map.setView(positions[0], singleSite ? 13 : 8)
    } else if (positions.length > 1) {
      map.fitBounds(positions, { padding: [24, 24], maxZoom: 10 })
    }
  }, [map, positions, singleSite])
  return null
}

export function SiteMap({ sites, singleSite = false }: { sites: Site[]; singleSite?: boolean }) {
  const [tileError, setTileError] = useState(false)
  const positionedSites = useMemo(() => sites.filter(hasCoordinates), [sites])
  const positions = useMemo(() => positionedSites.map((site) => [site.latitude, site.longitude] as Position), [positionedSites])
  const cities = useMemo(() => [...new Set(positionedSites.map(cityKey))].sort((left, right) => left.localeCompare(right)), [positionedSites])
  const colors = useMemo(() => new Map(cities.map((city, index) => [city, cityColors[index % cityColors.length]])), [cities])

  if (positionedSites.length === 0) {
    return <EmptyState title="No coordinates available" detail="This map requires valid latitude and longitude values from the source." />
  }

  return <div className="site-map-block" aria-label="Research site map">
    <div className={`site-map${singleSite ? ' site-map-single' : ''}`}>
      <MapContainer center={positions[0]} zoom={singleSite ? 13 : 5} scrollWheelZoom={false}>
        <FitSites positions={positions} singleSite={singleSite} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />
        {positionedSites.map((site) => {
          const city = cityKey(site)
          const color = colors.get(city) ?? cityColors[0]
          return <CircleMarker
            key={site.id}
            center={[site.latitude, site.longitude]}
            radius={7}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.88, weight: 2 }}
          >
            <Popup>
              <strong>{site.name}</strong><br />
              {site.cityName ?? site.cityId ?? 'City not supplied'}<br />
              <Link to={`/sites/${encodeURIComponent(site.id)}`}>Open site {site.id}</Link>
            </Popup>
          </CircleMarker>
        })}
      </MapContainer>
    </div>
    {!singleSite && <div className="site-map-legend" aria-label="Map markers by city">
      {cities.map((city) => <span key={city}><i style={{ backgroundColor: colors.get(city) }} />{city}</span>)}
    </div>}
    {tileError && <div className="map-tile-warning" role="status">OpenStreetMap tiles could not be loaded. Site markers and links remain available.</div>}
  </div>
}
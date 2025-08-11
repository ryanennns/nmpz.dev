import React, { useState, useEffect, useRef, useCallback } from "react";
import { LoadingSpinner } from "./LoadingSpinner.tsx";
import { GameHud } from "./GameHud.tsx";
import { SettingsModal } from "./SettingsModal.tsx";

// Type definitions for Google Maps
declare global {
  interface Window {
    google: any;
  }
}

interface GoogleMapsLatLng {
  lat(): number;
  lng(): number;
}

interface GoogleMapsMarker {
  setMap(map: any): void;
  getPosition(): GoogleMapsLatLng;
}

interface GoogleMapsPolyline {
  setMap(map: any): void;
}

interface GoogleMapsMap {
  setZoom(zoom: number): void;
  setCenter(position: { lat: number; lng: number }): void;
  addListener(event: string, callback: (e: any) => void): void;
  fitBounds(bounds: any, padding: number): void;
}

interface GoogleMapsPanorama {
  setPano(panoId: string): void;
  setZoom(zoom: number): void;
  setPov(pov: { heading: number; pitch: number }): void;
  setVisible(visible: boolean): void;
}

interface PanoramaData {
  location: {
    pano: string;
    latLng: GoogleMapsLatLng;
  };
  links?: Array<{ heading: number }>;
}

// Region definition: [minLat, maxLat, minLng, maxLng, weight]
type Region = [number, number, number, number, number];

type GamePhase = "guess" | "reveal";

const GeoGuessrGame: React.FC = () => {
  // Game state
  const [rounds, setRounds] = useState<number>(0);
  const [totalScore, setTotalScore] = useState<number>(0);
  const [phase, setPhase] = useState<GamePhase>("guess");
  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [mapExpanded, setMapExpanded] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const [distance, setDistance] = useState<number>(0);
  const [roundScore, setRoundScore] = useState<number>(0);
  const [roundHistory, setRoundHistory] = useState<GoogleMapsLatLng[]>([]);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Refs for Google Maps objects
  const mapRef = useRef<HTMLDivElement>(null);
  const panoRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<GoogleMapsMap | null>(null);
  const panoInstanceRef = useRef<GoogleMapsPanorama | null>(null);
  const svServiceRef = useRef<any>(null);
  const guessMarkerRef = useRef<GoogleMapsMarker | null>(null);
  const trueMarkerRef = useRef<GoogleMapsMarker | null>(null);
  const lineRef = useRef<GoogleMapsPolyline | null>(null);
  const trueLatLngRef = useRef<GoogleMapsLatLng | null>(null);
  const currentPanoIdRef = useRef<string | null>(null);

  // Constants
  const REGIONS: Region[] = [
    [-56, -10, -75, -35, 0.8],
    [-35, 37, -20, 55, 1.0],
    [5, 60, -130, -60, 1.0],
    [30, 72, -10, 40, 1.2],
    [-45, 10, 110, 155, 0.7],
    [5, 50, 65, 150, 1.0],
  ];

  // Utility functions
  const randBetween = (min: number, max: number): number =>
    Math.random() * (max - min) + min;

  const deg2rad = (d: number): number => (d * Math.PI) / 180;

  const haversineDistanceKm = (
    a: GoogleMapsLatLng,
    b: GoogleMapsLatLng,
  ): number => {
    const R = 6371;
    const dLat = deg2rad(b.lat() - a.lat());
    const dLng = deg2rad(b.lng() - a.lng());
    const lat1 = deg2rad(a.lat());
    const lat2 = deg2rad(b.lat());
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const c =
      2 *
      Math.atan2(
        Math.sqrt(
          sinDLat * sinDLat +
            Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng,
        ),
        Math.sqrt(
          1 -
            (sinDLat * sinDLat +
              Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng),
        ),
      );
    return R * c;
  };

  const scoreFromDistanceKm = (d: number): number => {
    const s = Math.round(5000 * Math.exp(-d / 2000));
    return Math.max(0, Math.min(5000, s));
  };

  const headingToCardinal = (h: number): string => {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
    return dirs[Math.round((h % 360) / 45)];
  };

  const norm360 = (d: number): number => ((d % 360) + 360) % 360;

  const angDiff = (a: number, b: number): number => {
    const d = Math.abs(norm360(a) - norm360(b));
    return d > 180 ? 360 - d : d;
  };

  const perpendicularToRoad = (
    links: Array<{ heading: number }> | undefined,
  ): number => {
    if (!links || links.length === 0) {
      return Math.floor(Math.random() * 360);
    }

    if (links.length >= 2) {
      let i = 0,
        j = 1,
        best = 0;
      for (let a = 0; a < links.length; a++) {
        for (let b = a + 1; b < links.length; b++) {
          const sep = angDiff(links[a].heading, links[b].heading);
          if (sep > best) {
            best = sep;
            i = a;
            j = b;
          }
        }
      }
      const h1 = norm360(links[i].heading);
      const h2 = norm360(links[j].heading);
      let mid = norm360(h1 + angDiff(h1, h2) / 2);
      const d = norm360(h2 - h1);
      if (d > 180) mid = norm360(mid + 180);
      const side = Math.random() < 0.5 ? -180 : 180;
      return norm360(mid + side);
    }

    const road = links[0].heading;
    const side = Math.random() < 0.5 ? -180 : 180;
    return norm360(road + side);
  };

  // Load Google Maps script
  const loadGoogleMapsScript = useCallback((key: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Google Maps script"));
      document.body.appendChild(script);
    });
  }, []);

  // Initialize game
  const initializeGame = useCallback(async (): Promise<void> => {
    if (!apiKey || !mapRef.current || !panoRef.current) return;

    try {
      await loadGoogleMapsScript(apiKey);

      // Initialize map
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 20, lng: 0 },
        zoom: 2,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
        draggableCursor: "crosshair",
      });

      // Initialize Street View service
      svServiceRef.current = new window.google.maps.StreetViewService();

      // Initialize panorama
      panoInstanceRef.current = new window.google.maps.StreetViewPanorama(
        panoRef.current,
        {
          addressControl: false,
          linksControl: false,
          panControl: false,
          zoomControl: false,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
          clickToGo: false,
          visible: true,
        },
      );

      // Add click listener to map
      mapInstanceRef.current?.addListener("click", (e: any) => {
        // Don't allow guesses if settings modal is open or not in guess phase
        if (phase !== "guess" || showSettings) {
          return;
        }

        if (guessMarkerRef.current) {
          guessMarkerRef.current.setMap(null);
        }

        guessMarkerRef.current = new window.google.maps.Marker({
          position: e.latLng,
          map: mapInstanceRef.current,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: "#f59e0b",
            fillOpacity: 1,
            strokeColor: "#7c2d12",
            strokeWeight: 2,
          },
          clickable: false,
        });
      });

      setGameStarted(true);
      nextRound();
    } catch (error) {
      console.error("Failed to initialize Google Maps:", error);
      alert("Failed to load Google Maps. Please check your API key.");
    }
  }, [apiKey, phase, showSettings]);

  // Find random panorama
  const findRandomPano = async (): Promise<{
    panoId: string;
    location: { latLng: GoogleMapsLatLng };
    links: Array<{ heading: number }>;
  }> => {
    const totalW = REGIONS.reduce((s, r) => s + r[4], 0);
    const pick = Math.random() * totalW;
    let acc = 0;
    let chosen = REGIONS[0];

    for (const r of REGIONS) {
      acc += r[4];
      if (pick <= acc) {
        chosen = r;
        break;
      }
    }

    const maxTries = 40;
    for (let i = 0; i < maxTries; i++) {
      const lat = randBetween(chosen[0], chosen[1]);
      const lng = randBetween(chosen[2], chosen[3]);
      const loc = new window.google.maps.LatLng(lat, lng);

      try {
        const data: PanoramaData = await new Promise((resolve, reject) => {
          svServiceRef.current.getPanorama(
            {
              location: loc,
              radius: 50000,
              source: window.google.maps.StreetViewSource.OUTDOOR,
            },
            (data: PanoramaData, status: any) => {
              if (status === window.google.maps.StreetViewStatus.OK) {
                resolve(data);
              } else {
                reject(new Error(`Street View error: ${status}`));
              }
            },
          );
        });

        if (data && data.location && data.location.pano) {
          return {
            panoId: data.location.pano,
            location: data.location,
            links: data.links || [],
          };
        }
      } catch (e) {
        // Keep trying
      }
    }
    throw new Error("No pano found after many tries");
  };

  // Next rounds
  const nextRound = async (): Promise<void> => {
    if (!mapInstanceRef.current || !panoInstanceRef.current) return;

    setPhase("guess");
    setDistance(0);
    setRoundScore(0);

    // Clear previous markers
    if (guessMarkerRef.current) {
      guessMarkerRef.current.setMap(null);
      guessMarkerRef.current = null;
    }
    if (trueMarkerRef.current) {
      trueMarkerRef.current.setMap(null);
      trueMarkerRef.current = null;
    }
    if (lineRef.current) {
      lineRef.current.setMap(null);
      lineRef.current = null;
    }

    mapInstanceRef.current.setZoom(2);
    mapInstanceRef.current.setCenter({ lat: 20, lng: 0 });

    setRounds((prev) => prev + 1);
    setLoading(true);

    try {
      const { panoId, location, links } = await findRandomPano();
      currentPanoIdRef.current = panoId;
      trueLatLngRef.current = location.latLng;

      const heading = perpendicularToRoad(links);
      const pitch = Math.floor(randBetween(-5, 5));

      setCurrentHeading(heading);

      panoInstanceRef.current.setPano(panoId);
      panoInstanceRef.current.setZoom(0);
      panoInstanceRef.current.setPov({ heading, pitch });
      panoInstanceRef.current.setVisible(true);

      setTimeout(() => {
        setLoading(false);
      }, 500);
    } catch (error) {
      setLoading(false);
      console.error("Failed to load pano", error);
      alert("Could not find a Street View location. Try again.");
    }
  };

  // Reveal answer
  const reveal = (): void => {
    if (
      !guessMarkerRef.current ||
      !trueLatLngRef.current ||
      !mapInstanceRef.current
    )
      return;

    if (trueMarkerRef.current) {
      trueMarkerRef.current.setMap(null);
    }

    trueMarkerRef.current = new window.google.maps.Marker({
      position: trueLatLngRef.current,
      map: mapInstanceRef.current,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: "#10b981",
        fillOpacity: 1,
        strokeColor: "#0f766e",
        strokeWeight: 2,
      },
      title: "Click to view in Google Street View",
      clickable: true,
    });

    setRoundHistory((previous) => [
      ...previous,
      ...(trueLatLngRef.current !== null ? [trueLatLngRef.current] : []),
    ]);

    lineRef.current = new window.google.maps.Polyline({
      map: mapInstanceRef.current,
      path: [guessMarkerRef.current.getPosition(), trueLatLngRef.current],
      geodesic: false,
      strokeOpacity: 1,
      strokeWeight: 3,
    });

    const distKm = haversineDistanceKm(
      guessMarkerRef.current.getPosition(),
      trueLatLngRef.current,
    );
    const roundScoreValue = scoreFromDistanceKm(distKm);

    setDistance(distKm);
    setRoundScore(roundScoreValue);
    setTotalScore((prev) => prev + roundScoreValue);

    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend(guessMarkerRef.current.getPosition());
    bounds.extend(trueLatLngRef.current);

    setTimeout(() => {
      window.google.maps.event.trigger(mapInstanceRef.current, "resize");
      mapInstanceRef.current!.fitBounds(bounds, 80);
    }, 50);

    setPhase("reveal");
  };

  // Handle spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.code === "Space") {
        e.preventDefault();
        // Only process spacebar actions if settings modal is closed
        if (!showSettings) {
          if (phase === "guess") {
            reveal();
          } else {
            nextRound();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, showSettings]);


  useEffect(() => {
    console.log(roundHistory.map((rh) => [rh.lat(), rh.lng()]));
  }, [roundHistory]);

  // Start game when API key is provided
  useEffect(() => {
    if (apiKey && !gameStarted) {
      initializeGame();
    }
  }, [apiKey, gameStarted, initializeGame]);

  const handleApiKeySubmit = (): void => {
    const key = apiKeyInput.trim();
    if (key) {
      setApiKey(key);
      localStorage.setItem("gmaps_api_key", key);
    }
  };

  // Check for existing API key on mount
  useEffect(() => {
    const storedKey = localStorage.getItem("gmaps_api_key");
    if (storedKey) {
      setApiKey(storedKey);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setApiKeyInput(e.target.value);
  };

  const handleMouseEnter = () => setMapExpanded(true);

  const handleMouseLeave = () => setMapExpanded(false);

  if (!apiKey) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-slate-900 p-8 rounded-lg shadow-2xl max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">
            GeoGuessr Clone
          </h1>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Google Maps API Key
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Enter your Google Maps API key"
              />
            </div>
            <button
              onClick={handleApiKeySubmit}
              className="w-full bg-green-500 text-white py-2 px-4 rounded-md font-semibold hover:bg-green-600 transition-colors"
            >
              Start Game
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            You need a Google Maps API key with Street View Static API enabled.
          </p>
        </div>
      </div>
    );
  }

  // Settings handler
  const toggleSettings = (): void => {
    setShowSettings(!showSettings);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* Street View Panorama */}
      <div className="absolute inset-0">
        <div ref={panoRef} className="w-full h-full" />
        {/* Transparent overlay that intercepts all input */}
        <div
          className="absolute inset-0 z-10"
          style={{ cursor: "default" }}
          aria-hidden="true"
        />
      </div>

      {loading && <LoadingSpinner />}

      {/* HUD */}
      <GameHud totalScore={totalScore} rounds={rounds} />

      {/* Settings Gear */}
      <div className="fixed left-4 bottom-4 z-40">
        <button 
          onClick={toggleSettings}
          className="bg-slate-900/85 backdrop-blur-md p-3 rounded-full text-white shadow-2xl hover:bg-slate-800/85 transition-colors border border-slate-200/10"
          title="Settings"
        >
          <span className="text-xl">⚙️</span>
        </button>
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={toggleSettings} />

      {/* Compass */}
      <div className="fixed right-4 top-4 z-30 flex flex-col items-center gap-2">
        <div className="bg-slate-900/85 backdrop-blur-md px-3 py-1 rounded-full text-sm font-bold text-white min-w-20 text-center shadow-2xl border border-slate-200/10">
          {headingToCardinal(currentHeading)} (
          {Math.round(((currentHeading % 360) + 360) % 360)}°)
        </div>
      </div>

      {/* Result Card */}
      {
        <div className="fixed right-4 top-32 z-30 bg-slate-900/85 backdrop-blur-md p-3 rounded-xl shadow-2xl">
          <div className="flex gap-2 items-baseline">
            <b className="text-sm text-white">Distance:</b>
            <span className="text-white">{distance.toFixed(1)} km</span>
          </div>
          <div className="flex gap-2 items-baseline">
            <b className="text-sm text-white">Round score:</b>
            <span className="text-white">{roundScore}</span>
          </div>
        </div>
      }

      {/* Map */}
      <div
        className={`fixed right-4 bottom-4 z-40 bg-white rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 ease-out hover:cursor-crosshair ${
          phase === "reveal"
            ? "w-[65vw] h-[70vh] max-w-4xl max-h-[700px]"
            : "w-64 h-44"
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width: phase === "reveal" ? "65vw" : mapExpanded ? "65vw" : "20vw",
          height: phase === "reveal" ? "70vh" : mapExpanded ? "80vh" : "20vh",
        }}
      >
        <div ref={mapRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default GeoGuessrGame;

import { useState, useEffect } from 'react';

export function useGeolocation() {
    const hasGeolocation = typeof navigator !== 'undefined' && 'geolocation' in navigator;
    const [position, setPosition] = useState(null);
    const [error, setError] = useState(hasGeolocation ? null : 'Geolocation not supported');

    useEffect(() => {
        if (!hasGeolocation) {
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
                setError(null);
            },
            (err) => {
                setError(err.message);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [hasGeolocation]);

    return { position, error };
}

import { useState, useEffect } from 'react';
import { USER_POSITION_MOCK } from './useTrafikData';

export function useGeolocation() {
    const hasGeolocation = typeof navigator !== 'undefined' && 'geolocation' in navigator;
    const [position, setPosition] = useState(hasGeolocation ? null : USER_POSITION_MOCK);
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
                setPosition(USER_POSITION_MOCK); // Fallback mock
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [hasGeolocation]);

    return { position: position || USER_POSITION_MOCK, error };
}

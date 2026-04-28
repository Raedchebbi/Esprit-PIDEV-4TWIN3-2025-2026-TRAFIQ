import { useState, useCallback, useRef } from 'react';

export function useNotifications() {
    const notificationApi = typeof Notification === 'undefined' ? null : Notification;
    const [permission, setPermission] = useState(notificationApi?.permission || 'denied');
    const notifiedIds = useRef(new Set());

    const requestPermission = useCallback(async () => {
        if (!notificationApi) {
            return 'denied';
        }

        if (notificationApi.permission === 'default') {
            const perm = await notificationApi.requestPermission();
            setPermission(perm);
            return perm;
        }
        return notificationApi.permission;
    }, [notificationApi]);

    const sendNotification = useCallback((id, title, body) => {
        if (notifiedIds.current.has(id)) return; // Anti-spam
        notifiedIds.current.add(id);

        if (notificationApi?.permission === 'granted') {
            try {
                new notificationApi(title, { body, icon: '/vite.svg' });
            } catch (e) {
                console.warn('Notification failed:', e);
            }
        }
    }, [notificationApi]);

    return { permission, requestPermission, sendNotification };
}

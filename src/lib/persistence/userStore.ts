export type User = {
    email: string;
    id: number;
} | null;

const USER_STORAGE_KEY = 'igboverse_user';

export function getUser(): User {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
}

export function saveUser(user: User): void {
    if (user) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(USER_STORAGE_KEY);
    }
}

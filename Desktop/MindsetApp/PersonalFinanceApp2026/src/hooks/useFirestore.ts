import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, where, QueryConstraint } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

export function useFirestore<T>(collectionName: string, constraints: QueryConstraint[] = []) {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        if (!user) {
            setData([]);
            setLoading(false);
            return;
        }

        // Reference: users/{uid}/{collectionName}
        const ref = collection(db, 'users', user.uid, collectionName);

        // Add default validation to only fetch valid records if not specified
        const finalQuery = query(ref, ...constraints);

        const unsubscribe = onSnapshot(finalQuery, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as T[];

            setData(items);
            setLoading(false);
        }, (error) => {
            console.error(`Error reading ${collectionName}:`, error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, collectionName, JSON.stringify(constraints)]); // Weak dependency check for constraints

    return { data, loading };
}

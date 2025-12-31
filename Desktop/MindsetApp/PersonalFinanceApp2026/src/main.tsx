import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ScopeProvider } from './context/ScopeContext'

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(
        <StrictMode>
            <ScopeProvider>
                <App />
            </ScopeProvider>
        </StrictMode>
    );
}

import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from '../App';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/r/:sidoCd/:sigunguCd" element={<App />} />
        <Route path="/r/:sidoCd" element={<App />} />
        <Route path="/" element={<App />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  );
}

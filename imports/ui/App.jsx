import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import TopogramDetail from './pages/TopogramDetail';
import Builder from './pages/Builder';

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
  <Route path="/t/:id" element={<TopogramDetail />} />
  <Route path="/builder" element={<Builder />} />
    </Routes>
  </BrowserRouter>
);

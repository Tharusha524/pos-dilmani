import React from "react";
import { Navigate, Route, Routes } from "react-router";
import SalesDashboard from "./sales/SalesDashboard";
import SaleFormPage from "./sales/SaleFormPage";
import PosSaleFormPage from "./sales/PosSaleFormPage";

const Sales: React.FC = () => (
  <Routes>
    <Route index element={<SalesDashboard />} />
    <Route path="new" element={<PosSaleFormPage />} />
    {/* Scan-first cashier lane. Same session as /sales/new, different door. */}
    <Route path="checkout" element={<PosSaleFormPage initialView="scan" />} />
    <Route path=":id/edit" element={<SaleFormPage />} />
    <Route path="*" element={<Navigate to="/sales" replace />} />
  </Routes>
);

export default Sales;

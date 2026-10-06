import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider } from "@/contexts/AppContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

import * as TooltipPrimitive from '@radix-ui/react-tooltip';

// Create a client
const queryClient = new QueryClient();

// Get the base path from Vite's import.meta.env
const basePath = import.meta.env.BASE_URL || '/';

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <TooltipPrimitive.Provider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={basePath}>
          <Routes>
            <Route path="/" element={<Index />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipPrimitive.Provider>
    </AppProvider>
  </QueryClientProvider>
);

export default App;

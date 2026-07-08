import React from 'react';
import { Layout } from './components/layout';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Home } from './pages/home';
import { Analyze } from './pages/analyze';
import { Setup } from './pages/setup';
import { Sessions } from './pages/sessions';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AnalyzerProvider } from '@/context/AnalyzerContext';

const queryClient = new QueryClient();

function Router() {
  return (
    <AnalyzerProvider>
      <Layout>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/analyze" component={Analyze} />
          <Route path="/setup" component={Setup} />
          <Route path="/sessions" component={Sessions} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </AnalyzerProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

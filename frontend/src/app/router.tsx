import { createBrowserRouter, Navigate } from 'react-router'
import { CampaignPage } from '@/pages/campaign'
import { NewCampaignPage } from '@/pages/campaign-new'
import { CampaignsPage } from '@/pages/campaigns'
import { DashboardLayout } from './layouts/DashboardLayout'

export const router = createBrowserRouter([
  {
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Navigate to="/campaigns" replace /> },
      { path: 'campaigns', element: <CampaignsPage /> },
      { path: 'campaigns/new', element: <NewCampaignPage /> },
      { path: 'campaigns/:id', element: <CampaignPage /> },
      { path: '*', element: <Navigate to="/campaigns" replace /> },
    ],
  },
])

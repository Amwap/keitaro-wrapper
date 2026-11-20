import { createBrowserRouter, Navigate } from 'react-router'
import { CampaignPage } from '@/pages/campaign'
import { CampaignsPage } from '@/pages/campaigns'
import { GroupsPage } from '@/pages/groups'
import { DashboardLayout } from './layouts/DashboardLayout'

export const router = createBrowserRouter([
  {
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Navigate to="/campaigns" replace /> },
      { path: 'campaigns', element: <CampaignsPage /> },
      { path: 'campaigns/new', element: <CampaignsPage creating /> },
      { path: 'campaigns/:id', element: <CampaignPage /> },
      { path: 'groups', element: <GroupsPage /> },
      { path: '*', element: <Navigate to="/campaigns" replace /> },
    ],
  },
])

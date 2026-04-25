import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NavItem } from '@/components/NavItem';
import authStore from '@/stores/authStore';
import SunriseOutline from '@/assets/icons/sunrise-outline.svg?react';
import SunriseFill from '@/assets/icons/sunrise-fill.svg?react';
import CalendarOutline from '@/assets/icons/calendar-outline.svg?react';
import CalendarFill from '@/assets/icons/calendar-fill.svg?react';
import CirclesFill from '@/assets/icons/circles-fill.svg?react';
import CirclesOutline from '@/assets/icons/circles-outline.svg?react';
import GridCircleOutline from '@/assets/icons/grid-circle-outline.svg?react';
import GridCircleFill from '@/assets/icons/grid-circle-fill.svg?react';
import UserOutline from '@/assets/icons/user-outline.svg?react';
import UserFill from '@/assets/icons/user-fill.svg?react';

export default function Navigation() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const navLinks =
    authStore.userType === 'Patient'
      ? [
          {
            path: '/patient',
            iconOutline: SunriseOutline,
            iconFill: SunriseFill,
            label: t('Home'),
          },
          {
            path: '/patient-plan',
            iconOutline: CalendarOutline,
            iconFill: CalendarFill,
            label: t('Week Plan'),
          },
          {
            path: '/patient-process',
            iconOutline: CirclesOutline,
            iconFill: CirclesFill,
            label: t('Process'),
          },
          {
            path: '/patient-interventions',
            iconOutline: GridCircleOutline,
            iconFill: GridCircleFill,
            label: t('Library'),
          },
          {
            path: '/patient-profile',
            iconOutline: UserOutline,
            iconFill: UserFill,
            label: t('Profile'),
          },
        ]
      : authStore.userType === 'Therapist' || authStore.userType === 'Researcher'
        ? [
            {
              path: `/${authStore.userType?.toLowerCase()}`,
              iconOutline: SunriseOutline,
              iconFill: SunriseFill,
              label: t('Patients'),
            },
            {
              path: '/interventions',
              iconOutline: GridCircleOutline,
              iconFill: GridCircleFill,
              label: t('Library'),
            },
            {
              path: '/userprofile',
              iconOutline: UserOutline,
              iconFill: UserFill,
              label: t('Profile'),
            },
          ]
        : authStore.userType === 'Admin'
          ? [] // Admin: no nav links, only logout button
          : [
              {
                path: '/',
                iconOutline: SunriseOutline,
                iconFill: SunriseFill,
                label: t('Home'),
              },
            ];

  return (
    <>
      {/* MOBILE NAVIGATION */}
      <nav
        className="
          fixed bottom-0 left-0 right-0
          bg-white/80 backdrop-blur-2xl border-t border-x-0 border-b-0 border-solid border-accent
          md:hidden
          pt-4 pb-8
          z-50
        "
      >
        <div className="flex justify-around gap-2">
          {navLinks.map((link) => (
            <NavItem
              key={link.path}
              onClick={() => navigate(link.path)}
              iconOutline={link.iconOutline}
              iconFill={link.iconFill}
              label={link.label}
              active={location.pathname === link.path}
            />
          ))}
        </div>
      </nav>

      {/* DESKTOP NAVIGATION */}
      <nav
        className="
          hidden md:flex
          fixed top-0 left-0 right-0
          py-6
          z-50
        "
      >
        <div className="w-full flex justify-center gap-2">
          <div className="bg-white/80 backdrop-blur-2xl border border-accent rounded-full p-2 flex">
            {navLinks
              .filter((link) => link.path !== '/patient-profile')
              .map((link) => (
                <NavItem
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  iconOutline={link.iconOutline}
                  iconFill={link.iconFill}
                  label={link.label}
                  active={location.pathname === link.path}
                  desktop
                />
              ))}
          </div>
          <button
            onClick={() => navigate('/patient-profile')}
            className={`bg-white/80 backdrop-blur-2xl border border-accent aspect-square rounded-full transition flex items-center justify-center ${location.pathname === '/patient-profile' ? 'text-brand' : 'text-zinc-500 hover:text-black'}`}
          >
            <span
              className={`flex p-2 rounded-full ${location.pathname === '/patient-profile' ? 'bg-brand/5' : ''}`}
            >
              {location.pathname === '/patient-profile' ? (
                <UserFill className="w-5 h-5" />
              ) : (
                <UserOutline className="w-5 h-5" />
              )}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

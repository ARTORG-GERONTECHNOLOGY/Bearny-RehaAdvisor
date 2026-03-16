import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NavItem } from '@/components/NavItem';
import authStore from '@/stores/authStore';
import SunriseOutline from '@/assets/icons/sunrise-outline.svg?react';
import SunriseFill from '@/assets/icons/sunrise-fill.svg?react';
import CalendarOutline from '@/assets/icons/calendar-outline.svg?react';
import CalendarFill from '@/assets/icons/calendar-fill.svg?react';
import GridCircleOutline from '@/assets/icons/grid-circle-outline.svg?react';
import GridCircleFill from '@/assets/icons/grid-circle-fill.svg?react';
import UserOutline from '@/assets/icons/user-outline.svg?react';
import UserFill from '@/assets/icons/user-fill.svg?react';

// TODO:
// - move colors to config as soon as they are fixed
// - handle all states and user types (see old Header component for reference)
export default function Navigation() {
  const { t } = useTranslation();
  const location = useLocation();

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
          bg-[#F2F2F2] border-t border-x-0 border-b-0 border-solid border-[#D4D4D4]
          md:hidden
          pt-4 pb-8
          z-50
        "
      >
        <div className="flex justify-around gap-2">
          {navLinks.map((link) => (
            <NavItem
              key={link.path}
              onClick={() => {
                window.location.href = link.path;
              }}
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
          <div className="bg-[#F2F2F2] border border-[#D4D4D4] rounded-full p-2 flex">
            {navLinks
              .filter((link) => link.path !== '/patient-profile')
              .map((link) => (
                <NavItem
                  key={link.path}
                  onClick={() => {
                    window.location.href = link.path;
                  }}
                  iconOutline={link.iconOutline}
                  iconFill={link.iconFill}
                  label={link.label}
                  active={location.pathname === link.path}
                  desktop
                />
              ))}
          </div>
          <button
            onClick={() => {
              window.location.href = '/patient-profile';
            }}
            className="bg-[#F2F2F2] border border-[#D4D4D4] p-2 aspect-square rounded-full text-[#565656] hover:text-black transition flex items-center justify-center"
            style={{ color: location.pathname === '/patient-profile' ? '#03A578' : '#565656' }}
          >
            {location.pathname === '/patient-profile' ? (
              <UserFill className="w-5 h-5" />
            ) : (
              <UserOutline className="w-5 h-5" />
            )}
          </button>
        </div>
      </nav>
    </>
  );
}

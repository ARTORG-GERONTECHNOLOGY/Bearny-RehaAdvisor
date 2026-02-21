import { useLocation } from 'react-router-dom';
import { Home, Activity, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavItem } from '@/components/NavItem';
import authStore from '@/stores/authStore';

// TODO:
// - move colors to config as soon as they are fixed
// - handle all states and user types (see old Header component for reference)
export default function Navigation() {
  const { t } = useTranslation();
  const location = useLocation();

  const isLoggedIn = authStore.isAuthenticated;

  const handleLogout = async () => {
    await authStore.logout();
    window.location.href = '/';
  };

  const navLinks =
    authStore.userType === 'Patient'
      ? [
          { path: '/patient', icon: Home, label: t('Home') },
          { path: '/patient-interventions', icon: Activity, label: t('Interventions') },
        ]
      : authStore.userType === 'Therapist' || authStore.userType === 'Researcher'
        ? [
            { path: `/${authStore.userType?.toLowerCase()}`, icon: Home, label: t('Patients') },
            { path: '/interventions', icon: Activity, label: t('Interventions') },
            { path: '/userprofile', icon: User, label: t('Profile') },
          ]
        : authStore.userType === 'Admin'
          ? [] // Admin has no nav links, only logout button
          : [];

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
              icon={link.icon}
              label={link.label}
              active={location.pathname === link.path}
            />
          ))}
          {isLoggedIn && (
            <NavItem
              onClick={() => {
                handleLogout();
              }}
              icon={User}
              label={t('Logout')}
            />
          )}
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
            {navLinks.map((link) => (
              <NavItem
                key={link.path}
                onClick={() => {
                  window.location.href = link.path;
                }}
                icon={link.icon}
                label={link.label}
                active={location.pathname === link.path}
                desktop
              />
            ))}
            {isLoggedIn && (
              <NavItem
                onClick={() => {
                  handleLogout();
                }}
                icon={User}
                label={t('Logout')}
                desktop
              />
            )}
          </div>
          <button
            // TODO: unhide when profile page is implemented
            className="hidden bg-[#F2F2F2] border border-[#D4D4D4] p-2 aspect-square rounded-full text-[#565656] hover:text-black transition flex items-center justify-center"
          >
            <User size={20} />
          </button>
        </div>
      </nav>
    </>
  );
}

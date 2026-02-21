import { NavItem } from '@/components/NavItem';
import { Home, Calendar, Activity, Grid, User } from 'lucide-react';

// TODO:
// - move colors to config as soon as they are fixed
// - add translation for labels as soon as they are fixed
export default function Navigation() {
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
          <NavItem icon={Home} label="Home" active />
          <NavItem icon={Calendar} label="Schedule" />
          <NavItem icon={Activity} label="Progress" />
          <NavItem icon={Grid} label="Exercises" />
          <NavItem icon={User} label="Profile" />
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
            <NavItem icon={Home} label="Heute" active desktop />
            <NavItem icon={Calendar} label="Plan" desktop />
            <NavItem icon={Activity} label="Fortschritt" desktop />
            <NavItem icon={Grid} label="Interventionen" desktop />
          </div>
          <button className="bg-[#F2F2F2] border border-[#D4D4D4] p-2 aspect-square rounded-full text-[#565656] hover:text-black transition flex items-center justify-center">
            <User size={20} />
          </button>
        </div>
      </nav>
    </>
  );
}

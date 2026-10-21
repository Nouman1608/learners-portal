import { APP_CAMPUSES, chooseAppCampus, isWebChooser } from '../appCampus';
import { setAuthToken } from '../native';

/**
 * Pick which school to sign in to. In the mobile app this is the home screen (first launch
 * and after "Change school"; any saved login is dropped when switching). On the web it is
 * the front door at learnerspreschool.cloud, linking to each school's own portal.
 */
export default function CampusChooser() {
  const pick = async (key: (typeof APP_CAMPUSES)[number]['key']) => {
    if (isWebChooser) {
      const campus = APP_CAMPUSES.find((c) => c.key === key)!;
      window.location.href = `${campus.webUrl}/login`;
      return;
    }
    await setAuthToken(null);
    chooseAppCampus(key);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-100 flex flex-col items-center justify-center px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 text-center">Welcome</h1>
      <p className="mt-2 mb-8 text-sm text-gray-600 text-center">Choose your school to sign in</p>
      <div className="w-full max-w-sm space-y-4">
        {APP_CAMPUSES.map((campus) => (
          <button
            key={campus.key}
            type="button"
            onClick={() => pick(campus.key)}
            className="w-full flex items-center gap-4 bg-white rounded-xl shadow-lg p-4 text-left active:scale-[0.98] transition"
          >
            <span className="flex-shrink-0 flex items-center justify-center w-20 h-20">
              <img src={campus.logo} alt="" className="max-w-[80px] max-h-[80px]" />
            </span>
            <span>
              <span className="block text-lg font-semibold text-gray-900">{campus.school}</span>
              {campus.school !== campus.label && (
                <span className="block text-sm text-gray-500">{campus.label}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

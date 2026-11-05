import Workspace from "../workspace";
import PcEnrollmentPanel from "./pc-enrollment-panel";

export default function ComputersPage() {
  return (
    <>
      <Workspace />
      <div className="page-content">
        <PcEnrollmentPanel />
      </div>
    </>
  );
}

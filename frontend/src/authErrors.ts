/** Turn Cognito errors into plain-language messages. */
export function authErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name ?? "";
  const message = (error as { message?: string })?.message ?? "";
  switch (name) {
    case "NotAuthorizedException":
      return /disabled/i.test(message) ? "This account is disabled." : "That email and password don't match. Try again or reset your password.";
    case "UserNotFoundException":
      return "There's no account with that email yet. Create one instead.";
    case "UsernameExistsException":
      return "An account with that email already exists. Sign in instead.";
    case "InvalidPasswordException":
      return "That password doesn't meet the requirements below.";
    case "CodeMismatchException":
      return "That code isn't right. Check the latest email and try again.";
    case "ExpiredCodeException":
      return "That code has expired. Send a new one.";
    case "LimitExceededException":
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "InvalidParameterException":
      return message || "Please check the details you entered.";
    case "NetworkError":
      return "Can't reach the sign-in service. Check your connection.";
    default:
      return message || "Something went wrong. Please try again.";
  }
}
